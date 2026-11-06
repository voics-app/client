// Live check (client#126): alice calls bob with every setting at its default and bob (status DND) must
// produce audible output energy at the speakers while the ring is up, and both while his window is
// not focused. The probe taps what is routed to AudioDestinationNode, not just AudioContext.state.
// Not part of CI; runs against gitops/local on :18000 by default. Against another stack (e.g. production):
//   LIVE_BASE=https://api.voics.nl LIVE_GATEWAY=wss://gateway.voics.nl LIVE_CDN=https://cdn.voics.nl \n//   LIVE_CALLER=<email> LIVE_CALLEE=<email> LIVE_CALLEE_NAME=<username> LIVE_PASSWORD=<password> pnpm exec playwright test -c tests/live/playwright.live.config.ts ringtone-audible
// The two accounts must be friends with an existing DM channel.
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const BASE = process.env.LIVE_BASE ?? 'http://127.0.0.1:18000';
const GATEWAY = process.env.LIVE_GATEWAY ?? BASE.replace(/^http/, 'ws');
const CDN = process.env.LIVE_CDN ?? `${BASE}/cdn`;
const CALLER = process.env.LIVE_CALLER ?? 'alice@discordy.local';
const CALLEE = process.env.LIVE_CALLEE ?? 'bob@discordy.local';
const CALLEE_NAME = process.env.LIVE_CALLEE_NAME ?? 'bob';
const PASSWORD = process.env.LIVE_PASSWORD ?? 'Discordy-dev-2026!';

async function launch(email: string): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({
    args: [resolve(__dirname, '../..'), '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
    env: {
      ...process.env,
      DISCORDY_USER_DATA_DIR: mkdtempSync(join(tmpdir(), 'discordy-live-')),
      DISCORDY_API_URL: BASE,
      DISCORDY_GATEWAY_URL: GATEWAY,
      DISCORDY_CDN_URL: CDN,
      ELECTRON_RENDERER_URL: '',
    } as Record<string, string>,
  });
  const page = await app.firstWindow();
  await page.getByLabel('Email').fill(email, { timeout: 30_000 });
  await page.getByLabel('Password').fill(PASSWORD);
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
const resetPeak = (page: Page): Promise<void> => page.evaluate(() => void ((window as unknown as { __peak: number }).__peak = 0));

for (const hidden of [false, true]) test(`bob (default settings, DND${hidden ? ', window minimized' : ''}) hears the incoming-call ringtone`, async () => {
  test.setTimeout(150_000);
  const alice = await launch(CALLER);
  const bob = await launch(CALLEE);
  try {
    await alice.page.getByRole('navigation', { name: 'Servers' }).getByRole('button').first().click();
    await alice.page.locator('.dm-row', { hasText: CALLEE_NAME }).first().click({ timeout: 15_000 });
    if (hidden) await bob.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach((w) => w.minimize()));
    await resetPeak(bob.page);
    await alice.page.getByRole('button', { name: 'Start voice call' }).click();
    await expect(bob.page.getByRole('alertdialog', { name: /Incoming call from/ })).toBeVisible({ timeout: 15_000 });
    await bob.page.waitForTimeout(2_500);
    if (hidden) await bob.page.waitForTimeout(1_000);
    const focused = await bob.page.evaluate(() => document.hasFocus());
    const info = await bob.page.evaluate(() => `vis=${document.visibilityState}`);
    const pb = await peak(bob.page);
    const pa = await peak(alice.page);
    console.log(`[ringtone] bob peak=${pb.toFixed(4)} alice(ringback) peak=${pa.toFixed(4)} bobFocused=${focused} ${info}`);
    expect(pa, 'alice hears the ringback').toBeGreaterThan(0.01);
    expect(pb, 'bob hears the ringtone').toBeGreaterThan(0.05);
  } finally {
    await alice.app.close().catch(() => undefined);
    await bob.app.close().catch(() => undefined);
  }
});
