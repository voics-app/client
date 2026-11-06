// Production ringtone check (client#126): two throwaway accounts on production, A calls B in a DM, and B must
// produce audible output energy while the incoming call rings: once with B's window unfocused, once minimized.
// The probe taps everything routed to AudioDestinationNode. Cleanup schedules both accounts for deletion.
// Run: LIVE_BASE=https://api.voics.nl pnpm exec playwright test -c tests/live/playwright.live.config.ts ringtone-prod
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const API = process.env.LIVE_BASE ?? 'https://api.voics.nl';
const PROD = API === 'https://api.voics.nl';
const PASSWORD = 'E2e-Ring-Test-2026!';
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e3)}`;

interface Session { access_token: string; user: { id: string; username: string } }
interface Inst { app: ElectronApplication; page: Page; log: string[] }

async function rest<T>(method: string, path: string, token: string | null, body?: unknown): Promise<T> {
  const res = await fetch(`${API}/api/v1${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${(await res.text()).slice(0, 200)}`);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

const probe = () => {
  const w = window as unknown as Record<string, unknown>;
  w.__peak = 0;
  const original = AudioNode.prototype.connect as (this: AudioNode, ...a: unknown[]) => unknown;
  AudioNode.prototype.connect = function (this: AudioNode, ...args: unknown[]) {
    if (args[0] instanceof AudioDestinationNode) {
      const an = this.context.createAnalyser();
      an.fftSize = 2048;
      original.call(this, an);
      const data = new Float32Array(an.fftSize);
      setInterval(() => { an.getFloatTimeDomainData(data); for (const v of data) w.__peak = Math.max(w.__peak as number, Math.abs(v)); }, 25);
    }
    return original.apply(this, args);
  } as typeof AudioNode.prototype.connect;
};

async function launch(): Promise<Inst> {
  const log: string[] = [];
  const env: Record<string, string> = { ...(process.env as Record<string, string>), DISCORDY_USER_DATA_DIR: mkdtempSync(join(tmpdir(), 'discordy-ring-')), ELECTRON_RENDERER_URL: '' };
  if (PROD) for (const k of ['DISCORDY_API_URL', 'DISCORDY_GATEWAY_URL', 'DISCORDY_CDN_URL']) delete env[k];
  else Object.assign(env, { DISCORDY_API_URL: API, DISCORDY_GATEWAY_URL: API.replace(/^http/, 'ws'), DISCORDY_CDN_URL: `${API}/cdn` });
  const app = await electron.launch({ args: [resolve(__dirname, '../..'), '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'], env });
  const page = await app.firstWindow();
  page.on('console', (m) => { if (/ring|audio|error/i.test(m.text())) log.push(`[${m.type()}] ${m.text().slice(0, 200)}`); });
  await page.addInitScript(probe);
  await page.reload();
  return { app, page, log };
}

async function register(p: Page, email: string, username: string): Promise<void> {
  await p.getByRole('radio', { name: 'Create account' }).or(p.getByRole('button', { name: 'Create account' })).first().click({ timeout: 30_000 });
  await p.getByLabel('Email', { exact: true }).last().fill(email);
  await p.getByLabel('Username').last().fill(username);
  await p.getByLabel('Password', { exact: true }).last().fill(PASSWORD);
  await p.getByRole('button', { name: 'Create account' }).last().click();
  await expect(p.getByRole('navigation', { name: 'Servers' })).toBeVisible({ timeout: 60_000 });
}

const peak = (p: Page) => p.evaluate(() => (window as unknown as { __peak: number }).__peak);
const resetPeak = (p: Page) => p.evaluate(() => void ((window as unknown as { __peak: number }).__peak = 0));

test('production: B hears the incoming-call ringtone (unfocused, then minimized)', async () => {
  test.setTimeout(400_000);
  const nameA = `ringa${RUN}`.slice(0, 30), nameB = `ringb${RUN}`.slice(0, 30);
  const emailA = `discordy-e2e-${RUN}-ra@example.com`, emailB = `discordy-e2e-${RUN}-rb@example.com`;
  let A: Inst | undefined, B: Inst | undefined, sa: Session | undefined, sb: Session | undefined;
  const results: string[] = [];
  try {
    A = await launch(); await register(A.page, emailA, nameA);
    B = await launch(); await register(B.page, emailB, nameB);
    sa = await rest<Session>('POST', '/auth/login', null, { email: emailA, password: PASSWORD });
    sb = await rest<Session>('POST', '/auth/login', null, { email: emailB, password: PASSWORD });
    await rest('POST', '/users/@me/channels', sa.access_token, { recipient_ids: [sb.user.id] });
    await A.page.waitForTimeout(3_000);
    for (const minimized of [false, true]) {
      const label = minimized ? 'B minimized' : 'B unfocused';
      await A.page.getByRole('navigation', { name: 'Servers' }).getByRole('button').first().click();
      await A.page.locator('.dm-row', { hasText: nameB }).first().click({ timeout: 20_000 });
      await A.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach((w) => w.focus()));
      if (minimized) await B.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach((w) => w.minimize()));
      await resetPeak(B.page); await resetPeak(A.page);
      await A.page.getByRole('button', { name: 'Start voice call' }).click();
      await expect(B.page.getByRole('alertdialog', { name: /Incoming call from/ })).toBeAttached({ timeout: 20_000 });
      await B.page.waitForTimeout(4_000);
      const focused = await B.page.evaluate(() => document.hasFocus());
      const pb = await peak(B.page), pa = await peak(A.page);
      const line = `${label}: B ringtone peak=${pb.toFixed(4)} A ringback peak=${pa.toFixed(4)} B focused=${focused}`;
      console.log(`[ringtone-prod] ${line}`); results.push(line);
      expect(pb, `${label}: B hears the ringtone`).toBeGreaterThan(0.05);
      expect(pa, `${label}: A hears the ringback`).toBeGreaterThan(0.01);
      await A.page.getByRole('button', { name: /Disconnect|Leave call|Hang up/ }).first().click().catch(() => undefined);
      if (minimized) await B.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach((w) => w.restore()));
      await A.page.waitForTimeout(5_000);
    }
  } finally {
    console.log(`[ringtone-prod] results:\n${results.join('\n')}`);
    for (const i of [A, B]) if (i?.log.length) console.log(i.log.slice(-15).join('\n'));
    for (const s of [sa, sb]) if (s) await rest('POST', '/users/@me/delete', s.access_token, { password: PASSWORD }).then(() => console.log('account delete scheduled')).catch((e) => console.log(`cleanup account: ${(e as Error).message}`));
    await A?.app.close().catch(() => undefined);
    await B?.app.close().catch(() => undefined);
  }
});
