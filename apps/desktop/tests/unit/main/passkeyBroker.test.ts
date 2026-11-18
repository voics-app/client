import { afterEach, describe, expect, it, vi } from 'vitest';
import { request as httpRequest } from 'node:http';
import { PasskeyBroker } from '../../../src/main/passkeys/passkeyBroker';
import { passkeySite } from '../../../src/main/passkeys/config';
import type { PasskeyRequest } from '../../../src/shared/passkeys';
import { setNativeLocale } from '../../../src/main/locale';

const site = { origin: 'https://keys.example.test', rpId: 'example.test' };
const request: PasskeyRequest = { id: '12345678-1234-1234-1234-123456789012', kind: 'get', publicKey: { rpId: site.rpId, challenge: 'abcdefghijklmnop' } };
const brokers: PasskeyBroker[] = [];
afterEach(() => { brokers.splice(0).forEach(broker => broker.cancel()); setNativeLocale('en-US'); });

async function start(timeout = 60_000) {
  const open = vi.fn(async (_url: string) => undefined);
  const broker = new PasskeyBroker(() => site, open, timeout);
  brokers.push(broker);
  const result = broker.perform(request);
  await vi.waitFor(() => expect(open).toHaveBeenCalledOnce());
  const url = open.mock.calls[0]![0];
  const response = await fetch(url);
  const html = await response.text();
  const nonce = /<script nonce="([^"]+)"/.exec(html)![1]!;
  const post = (body: unknown, headers: Record<string, string> = {}) => fetch(new URL('/result', url), { method: 'POST', headers: { Origin: new URL(url).origin, 'Content-Type': 'application/json', 'X-Voics-Ceremony': nonce, ...headers }, body: JSON.stringify(body) });
  return { broker, result, url, response, html, post };
}

describe('browser passkey boundary', () => {
  it('uses the account language for the browser handoff while retaining the original ceremony', async () => {
    setNativeLocale('nl');
    const flow = await start();
    expect(flow.html).toContain('<html lang="nl" dir="ltr">');
    expect(flow.html).toContain('Doorgaan met je toegangssleutel');
    expect(flow.html).toContain('<button id="continue">Doorgaan</button>');
    const setup = JSON.parse(/const setup = (.*);/.exec(flow.html)![1]!);
    expect(setup.publicKey).toEqual(request.publicKey);
    expect(setup.site).toEqual(site);
    expect(setup.copy.description).toContain(site.origin);
    expect((await flow.post({ ok: false, reason: 'cancelled' })).status).toBe(204);
    expect(await flow.result).toEqual({ ok: false, reason: 'cancelled' });
  });
  it('opens only random-port IPv4 loopback and keeps options/state out of the URL', async () => {
    const flow = await start();
    expect(flow.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
    expect(flow.response.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(flow.response.headers.get('cache-control')).toBe('no-store');
    expect(flow.html).toContain('event.source !== child');
    expect(flow.html).toContain('event.origin !== setup.site.origin');
    expect(flow.html).not.toContain("postMessage('*'");
    flow.broker.cancel('another-id');
    expect((await flow.post({ ok: false, reason: 'cancelled' })).status).toBe(204);
    expect(await flow.result).toEqual({ ok: false, reason: 'cancelled' });
    await expect(fetch(flow.url)).rejects.toThrow();
  });

  it('rejects foreign origin, missing/wrong nonce, DNS rebinding and oversized/malformed responses', async () => {
    const flow = await start();
    const badHeaders: Record<string, string>[] = [{ Origin: 'https://evil.test' }, { Origin: 'null' }, { 'X-Voics-Ceremony': '' }];
    for (const headers of badHeaders) {
      expect((await flow.post({ ok: false, reason: 'cancelled' }, headers)).status).toBe(403);
    }
    const rebound = await new Promise<number | undefined>((resolve, reject) => {
      const req = httpRequest(flow.url, { headers: { Host: 'evil.test' } }, res => { res.resume(); resolve(res.statusCode); });
      req.on('error', reject); req.end();
    });
    expect(rebound).toBe(403);
    expect((await fetch(new URL('/result', flow.url), { method: 'OPTIONS', headers: { Origin: 'https://evil.test' } })).status).toBe(404);
    expect((await flow.post({ ok: true, credential: {} })).status).toBe(400);
    expect((await flow.post({ ok: true, credential: 'x'.repeat(65536) })).status).toBe(400);
    flow.broker.cancel();
    await flow.result;
  });

  it('binds clientData to the requested challenge and exact HTTPS origin before resolving once', async () => {
    const flow = await start();
    const credential = (origin: string, challenge = request.publicKey.challenge) => ({ id: 'key', rawId: 'a2V5', type: 'public-key', response: { clientDataJSON: Buffer.from(JSON.stringify({ type: 'webauthn.get', origin, challenge })).toString('base64url') } });
    expect((await flow.post({ ok: true, credential: credential('https://keys.example.test:444') })).status).toBe(400);
    expect((await flow.post({ ok: true, credential: credential(site.origin, 'wrong') })).status).toBe(400);
    const key = credential(site.origin);
    expect((await flow.post({ ok: true, credential: key })).status).toBe(204);
    expect(await flow.result).toEqual({ ok: true, credential: key });
    await expect(fetch(flow.url)).rejects.toThrow();
  });

  it('cleans up cancellation, timeout, failed browser launch and refuses concurrent work', async () => {
    const flow = await start();
    await expect(flow.broker.perform({ ...request, id: '87654321-1234-1234-1234-123456789012' })).rejects.toThrow('already open');
    flow.broker.cancel(request.id);
    expect(await flow.result).toEqual({ ok: false, reason: 'cancelled' });
    const unavailable = new PasskeyBroker(() => site, async () => { throw new Error('No browser'); });
    expect(await unavailable.perform(request)).toEqual({ ok: false, reason: 'unavailable' });
    const timed = new PasskeyBroker(() => site, async () => undefined, 1);
    expect(await timed.perform(request)).toEqual({ ok: false, reason: 'timeout' });
  });

  it('does not launch a browser for a wrong RP or missing site', async () => {
    const open = vi.fn();
    expect(await new PasskeyBroker(() => null, open).perform(request)).toEqual({ ok: false, reason: 'unavailable' });
    await expect(new PasskeyBroker(() => site, open).perform({ ...request, publicKey: { ...request.publicKey, rpId: 'attacker.test' } })).rejects.toThrow('Invalid');
    expect(open).not.toHaveBeenCalled();
  });
});

describe('explicit relying-party configuration', () => {
  const profile = { id: 'production' as const, apiUrl: 'https://api.example.test', gatewayUrl: '', cdnUrl: '' };
  const env = { DISCORDY_PASSKEY_ORIGIN: site.origin, DISCORDY_PASSKEY_RP_ID: site.rpId, DISCORDY_PASSKEY_API_URL: profile.apiUrl };
  it('binds configured origin and RP to this API connection', () => {
    expect(passkeySite(env, profile)).toEqual(site);
    expect(passkeySite(env, { ...profile, apiUrl: 'https://other.test' })).toBeNull();
    for (const origin of ['file:///', 'http://keys.example.test', 'https://keys.example.test/other', 'https://user:password@keys.example.test', 'https://keys.example.test?token=secret', 'https://keys.example.test#secret']) expect(passkeySite({ ...env, DISCORDY_PASSKEY_ORIGIN: origin }, profile)).toBeNull();
    expect(passkeySite({ ...env, DISCORDY_PASSKEY_RP_ID: 'other.test' }, profile)).toBeNull();
    const local = { ...env, DISCORDY_PASSKEY_ORIGIN: 'http://localhost:8443', DISCORDY_PASSKEY_RP_ID: 'localhost' };
    expect(passkeySite(local, profile)).toBeNull();
    expect(passkeySite(local, { ...profile, id: 'local' })).toEqual({ origin: 'http://localhost:8443', rpId: 'localhost' });
  });
});
