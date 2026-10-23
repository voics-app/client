// Live check (client#155): a voice call in a DM whose delivery mode is Ephemeral or P2P is end-to-end
// encrypted (MLS group over the voice node, frame encryption in a worker). Both sides must hear each
// other: remote audio energy at the output > 0. Not part of CI; run against gitops/local on :18000.
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const BASE = process.env.LIVE_BASE ?? 'http://127.0.0.1:18000';

async function launch(email: string): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({
    args: [resolve(__dirname, '../..'), '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
    env: {
      ...process.env,
      DISCORDY_USER_DATA_DIR: mkdtempSync(join(tmpdir(), 'discordy-live-')),
      DISCORDY_API_URL: BASE,
      DISCORDY_GATEWAY_URL: BASE.replace(/^http/, 'ws'),
      DISCORDY_CDN_URL: `${BASE}/cdn`,
      ELECTRON_RENDERER_URL: '',
    } as Record<string, string>,
  });
  const page = await app.firstWindow();
  await page.getByLabel('Email').fill(email, { timeout: 30_000 });
  await page.getByLabel('Password').fill('Discordy-dev-2026!');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('navigation', { name: 'Servers' })).toBeVisible({ timeout: 30_000 });
  await page.evaluate(() => {
    const w = window as unknown as { __peak?: number; __ctx?: { state: string; sink: string }[] };
    w.__peak = 0;
    w.__ctx = [];
    const original = AudioNode.prototype.connect as (this: AudioNode, ...a: unknown[]) => unknown;
    AudioNode.prototype.connect = function (this: AudioNode, ...args: unknown[]) {
      if (args[0] instanceof AudioDestinationNode && !(this.context as unknown as { __tapped?: boolean }).__tapped) {
        (this.context as unknown as { __tapped?: boolean }).__tapped = true;
        const analyser = this.context.createAnalyser();
        analyser.fftSize = 2048;
        original.call(this, analyser);
        const data = new Float32Array(analyser.fftSize);
        setInterval(() => {
          analyser.getFloatTimeDomainData(data);
          for (const v of data) w.__peak = Math.max(w.__peak ?? 0, Math.abs(v));
        }, 25);
      }
      return original.apply(this, args);
    } as typeof AudioNode.prototype.connect;
  });
  return { app, page };
}

const peak = (page: Page): Promise<number> => page.evaluate(() => (window as unknown as { __peak?: number }).__peak ?? 0);

async function rest<T>(method: string, path: string, token: string | null, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}/api/v1${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${await res.text()}`);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

for (const mode of ['ephemeral', 'p2p'] as const)
  test(`alice and bob hear each other in a ${mode} (end-to-end encrypted) DM call`, async () => {
    test.setTimeout(150_000);
    const login = (email: string) => rest<{ access_token: string; user: { id: string } }>('POST', '/auth/login', null, { email, password: 'Discordy-dev-2026!' });
    const a = await login('alice@discordy.local');
    const b = await login('bob@discordy.local');
    const dm = await rest<{ id: string }>('POST', '/users/@me/channels', a.access_token, { recipient_ids: [b.user.id] });
    await rest('PUT', `/users/@me/channels/${dm.id}/delivery-mode`, a.access_token, { mode });
    const alice = await launch('alice@discordy.local');
    const bob = await launch('bob@discordy.local');
    try {
      await alice.page.getByRole('navigation', { name: 'Servers' }).getByRole('button').first().click();
      await alice.page.locator('.dm-row', { hasText: 'bob' }).first().click({ timeout: 15_000 });
      await alice.page.getByRole('button', { name: 'Start voice call' }).click();
      await bob.page.getByRole('button', { name: 'Accept' }).click({ timeout: 20_000 });
      await alice.page.waitForTimeout(2_000);
      await Promise.all([alice.page, bob.page].map((p) => p.evaluate(() => void ((window as unknown as { __peak: number }).__peak = 0))));
      await alice.page.waitForTimeout(12_000);
      const pa = await peak(alice.page);
      const pb = await peak(bob.page);
      console.log(`[e2ee-audio] ${mode}: alice hears bob peak=${pa.toFixed(4)} bob hears alice peak=${pb.toFixed(4)}`);
      expect(pa, 'alice hears bob').toBeGreaterThan(0.001);
      expect(pb, 'bob hears alice').toBeGreaterThan(0.001);
    } finally {
      await alice.app.close().catch(() => undefined);
      await bob.app.close().catch(() => undefined);
      await rest('PUT', `/users/@me/channels/${dm.id}/delivery-mode`, a.access_token, { mode: null }).catch(() => undefined);
    }
  });
