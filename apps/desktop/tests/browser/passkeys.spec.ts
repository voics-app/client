import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { createServer, type Server } from 'node:https';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { PasskeyBroker } from '../../src/main/passkeys/passkeyBroker';

const site = { origin: 'https://localhost:8443', rpId: 'localhost' };
const apiUrl = process.env.PASSKEY_BROWSER_API;
const access = process.env.PASSKEY_BROWSER_ACCESS;
const website = process.env.PASSKEY_BROWSER_SITE;
let server: Server;

async function api(method: string, path: string, body?: unknown, token = access) {
  const response = await fetch(`${apiUrl}/api/v1${path}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: response.status === 204 ? null : await response.json() as Record<string, unknown> };
}

test.beforeAll(async () => {
  if (!apiUrl || !access || !website) throw new Error('Run with the isolated API browser harness described in the passkey runbook.');
  const key = await readFile(process.env.PASSKEY_BROWSER_TLS_KEY!);
  const cert = await readFile(process.env.PASSKEY_BROWSER_TLS_CERT!);
  server = createServer({ key, cert }, (request, response) => {
    const names: Record<string, string> = { '/passkeys/index.html': 'index.html', '/passkeys/passkeys.js': 'passkeys.js', '/passkeys/credentials.js': 'credentials.js', '/passkeys/passkeys.css': 'passkeys.css' };
    const name = names[request.url ?? ''];
    if (!name) { response.writeHead(404); response.end(); return; }
    response.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html');
    response.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    response.setHeader('Cross-Origin-Opener-Policy', 'unsafe-none');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Cache-Control', 'no-store');
    void readFile(resolve(website, 'dist/passkeys', name)).then(bytes => response.end(bytes)).catch(() => { response.writeHead(500); response.end(); });
  });
  await new Promise<void>(ready => server.listen(8443, '127.0.0.1', ready));
});
test.afterAll(async () => { await new Promise<void>(done => server?.close(() => done())); });

interface BrowserCredential { credentialId: string; isResidentCredential: boolean; privateKey: string; signCount: number; rpId?: string; userHandle?: string }

async function ceremony(context: BrowserContext, kind: 'create' | 'get', publicKey: Record<string, unknown>, savedCredentials?: BrowserCredential[]) {
  let parent!: Page;
  const broker = new PasskeyBroker(() => site, async url => { parent = await context.newPage(); await parent.goto(url); });
  const result = broker.perform({ id: randomUUID(), kind, publicKey });
  await expect.poll(() => parent?.url()).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
  const popupPromise = parent.waitForEvent('popup');
  await parent.getByRole('button', { name: 'Continue', exact: true }).click();
  const popup = await popupPromise;
  await popup.waitForLoadState();
  expect(popup.url()).toBe(`${site.origin}/passkeys/index.html`);
  const cdp = await context.newCDPSession(popup);
  await cdp.send('WebAuthn.enable');
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  for (const credential of savedCredentials ?? []) await cdp.send('WebAuthn.addCredential', { authenticatorId, credential });
  return { parent, popup, broker, result, cdp, authenticatorId };
}

test('real browser enrollment, signed login, rename, recovery and removal round-trip', async ({ context }, testInfo) => {
  const network: string[] = [];
  const errors: string[] = [];
  context.on('request', request => network.push(request.url()));
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  const started = await api('POST', '/users/@me/mfa/passkeys/register/start', { password: 'a-long-enough-passphrase', name: 'Browser test key' });
  expect(started.status).toBe(200);
  const challenge = started.body!;
  const registration = await ceremony(context, 'create', challenge.publicKey as Record<string, unknown>);
  await expect(registration.popup.getByRole('heading', { name: 'Add your passkey' })).toBeVisible();
  // Same-origin impostor tab and a wrong nonce from the real tab cannot complete this request.
  const nonce = /<script nonce="([^"]+)"/.exec(await registration.parent.content())![1]!;
  const impostorPromise = registration.parent.waitForEvent('popup');
  await registration.parent.evaluate(url => { window.open(url, '_blank'); }, `${site.origin}/passkeys/index.html`);
  const impostor = await impostorPromise;
  await impostor.waitForLoadState();
  const parentOrigin = new URL(registration.parent.url()).origin;
  await impostor.evaluate(({ nonce, parentOrigin }) => window.opener.postMessage({ type: 'voics:result', nonce, result: { ok: false, reason: 'cancelled' } }, parentOrigin), { nonce, parentOrigin });
  await registration.popup.evaluate(parentOrigin => window.opener.postMessage({ type: 'voics:result', nonce: 'wrong', result: { ok: false, reason: 'cancelled' } }, parentOrigin), parentOrigin);
  await impostor.close();
  await registration.popup.screenshot({ path: testInfo.outputPath('enrollment.png') });
  await registration.popup.getByRole('button', { name: 'Continue with passkey' }).click();
  const response = await registration.result;
  expect(response.ok).toBe(true);
  if (!response.ok) throw new Error('Browser registration failed');
  const registered = await api('POST', '/users/@me/mfa/passkeys/register/finish', { challenge_id: challenge.challenge_id, credential: response.credential });
  expect(registered.status).toBe(200);
  const { credentials } = await registration.cdp.send('WebAuthn.getCredentials', { authenticatorId: registration.authenticatorId });
  expect(credentials).toHaveLength(1);
  await registration.popup.close(); await registration.parent.close();
  const key = registered.body!.passkey as { id: string };
  const backup = registered.body!.backup_codes as { code: string }[];
  expect(backup).toHaveLength(10);
  expect((await api('GET', '/users/@me')).body!.mfa_enabled).toBe(true);
  expect((await api('PATCH', `/users/@me/mfa/passkeys/${key.id}`, { name: 'Renamed browser key' })).body!.name).toBe('Renamed browser key');

  const login = () => api('POST', '/auth/login', { email: 'passkey@example.com', password: 'a-long-enough-passphrase' }, '');
  const pending = await login();
  expect(pending.status).toBe(401);
  expect(pending.body!.methods).toEqual(['webauthn', 'backup_code']);
  const ticket = pending.body!.ticket;
  const assertionChallenge = (await api('POST', '/auth/mfa/webauthn/start', { ticket }, '')).body!;
  const assertion = await ceremony(context, 'get', assertionChallenge.publicKey as Record<string, unknown>, credentials);
  await assertion.popup.getByRole('button', { name: 'Continue with passkey' }).click();
  const signed = await assertion.result;
  expect(signed.ok).toBe(true);
  if (!signed.ok) throw new Error('Browser assertion failed');
  const authBody = { ticket, challenge_id: assertionChallenge.challenge_id, credential: signed.credential };
  expect((await api('POST', '/auth/mfa/webauthn/finish', authBody, '')).status).toBe(200);
  expect((await api('POST', '/auth/mfa/webauthn/finish', authBody, '')).status).toBe(400);
  await assertion.popup.close(); await assertion.parent.close();

  const retry = await login();
  const cancelChallenge = (await api('POST', '/auth/mfa/webauthn/start', { ticket: retry.body!.ticket }, '')).body!;
  const cancelled = await ceremony(context, 'get', cancelChallenge.publicKey as Record<string, unknown>);
  await cancelled.popup.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(await cancelled.result).toEqual({ ok: false, reason: 'cancelled' });
  const recoveryBody = { ticket: retry.body!.ticket, code: backup[0]!.code };
  expect((await api('POST', '/auth/mfa/totp', recoveryBody, '')).status).toBe(200);
  await cancelled.popup.close(); await cancelled.parent.close();
  expect((await api('DELETE', `/users/@me/mfa/passkeys/${key.id}`, { password: 'a-long-enough-passphrase', code: backup[1]!.code })).status).toBe(204);
  expect((await api('GET', '/users/@me')).body!.mfa_enabled).toBe(false);
  expect(errors).toEqual([]);
  expect(network.every(url => !url.includes('?') && !url.includes('#') && !url.includes(String(ticket)) && !url.includes(access!))).toBe(true);
  expect(network.every(url => url.startsWith(site.origin) || /^http:\/\/127\.0\.0\.1:\d+\/(?:result)?$/.test(url))).toBe(true);
});
