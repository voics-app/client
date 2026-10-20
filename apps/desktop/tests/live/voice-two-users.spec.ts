// Live check: two real clients (alice + bob) join the same voice channel and must both reach
// "Voice connected" and see each other. Not part of CI; run against gitops/local on :18000.
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const BASE = process.env.LIVE_BASE ?? 'http://127.0.0.1:18000';

async function joinAs(email: string): Promise<{ app: ElectronApplication; page: Page }> {
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
  page.on('pageerror', (e) => console.log(`[${email} pageerror] ${e.message}`));
  await page.getByLabel('Email').fill(email, { timeout: 30_000 });
  await page.getByLabel('Password').fill('Discordy-dev-2026!');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('navigation', { name: 'Servers' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('navigation', { name: 'Servers' }).getByRole('button', { name: 'Discordy HQ' }).click();
  await page.getByRole('button', { name: /Lounge/ }).first().click();
  return { app, page };
}

async function status(page: Page): Promise<string> {
  await page.keyboard.press('Escape');
  const text = await page.locator('body').innerText();
  return text.match(/(Voice connected|Reconnecting|Connecting|Connection failed[^\n]*)/)?.[0] ?? 'no status text';
}

test('alice and bob join the same voice channel', async () => {
  test.setTimeout(150_000);
  const alice = await joinAs('alice@discordy.local');
  const bob = await joinAs('bob@discordy.local');
  await alice.page.waitForTimeout(15_000);
  const sa = await status(alice.page);
  const sb = await status(bob.page);
  const aliceSeesBob = (await alice.page.locator('.voice-occupants').innerText().catch(() => '')).includes('bob');
  const bobSeesAlice = (await bob.page.locator('.voice-occupants').innerText().catch(() => '')).includes('alice');
  console.log(`[two-users] alice=${sa} bob=${sb} aliceSeesBob=${aliceSeesBob} bobSeesAlice=${bobSeesAlice}`);
  await alice.app.close();
  await bob.app.close();
  expect(sa).toBe('Voice connected');
  expect(sb).toBe('Voice connected');
});
