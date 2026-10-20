// Live check against the local stack (gitops/local, Caddy on :18000): signs in as bob,
// joins the Lounge voice channel in "Discordy HQ" and records console output + gateway frames.
// Not part of CI. Run: npx playwright test -c tests/live/playwright.live.config.ts
import { _electron as electron, expect, test } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const BASE = process.env.LIVE_BASE ?? 'http://127.0.0.1:18000';

test('bob joins a voice channel through the real client', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'discordy-live-'));
  const app = await electron.launch({
    args: [resolve(__dirname, '../..'), '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
    env: {
      ...process.env,
      DISCORDY_USER_DATA_DIR: userData,
      DISCORDY_API_URL: BASE,
      DISCORDY_GATEWAY_URL: BASE.replace(/^http/, 'ws'),
      DISCORDY_CDN_URL: `${BASE}/cdn`,
      ELECTRON_RENDERER_URL: process.env.LIVE_DEV ? 'http://localhost:5173' : '',
    } as Record<string, string>,
  });
  const page = await app.firstWindow();
  page.on('console', (m) => console.log(`[console.${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
  page.on('websocket', (ws) => {
    console.log(`[ws open] ${ws.url()}`);
    ws.on('framereceived', (f) => {
      const text = typeof f.payload === 'string' ? f.payload : f.payload.toString();
      if (/"t":"(VOICE_|READY|GUILD_CREATE)|"op":(2|4|8)[,}]/.test(text)) console.log(`[ws <-] ${text.slice(0, 260)}`);
    });
    ws.on('framesent', (f) => {
      const text = typeof f.payload === 'string' ? f.payload : f.payload.toString();
      if (!text.includes('"op":1,') && !text.includes('"op":3,')) console.log(`[ws ->] ${text.slice(0, 260)}`);
    });
    ws.on('close', () => console.log(`[ws close] ${ws.url()}`));
  });

  await page.getByLabel('Email').fill('bob@discordy.local', { timeout: 30_000 });
  await page.getByLabel('Password').fill('Discordy-dev-2026!');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('navigation', { name: 'Servers' })).toBeVisible({ timeout: 30_000 });
  if (process.env.RECONNECT) {
    // Drop the gateway connection the way a proxy restart does, then join after the client resumes.
    execFileSync('docker', ['restart', 'discordy-caddy-1']);
    await page.waitForTimeout(8_000);
    console.log('[reconnect] caddy restarted');
  }
  await page.getByRole('navigation', { name: 'Servers' }).getByRole('button', { name: 'Discordy HQ' }).click();
  await page.getByRole('button', { name: /Lounge/ }).first().click();

  await page.waitForTimeout(15_000);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(2_000);
  const panel = await page.locator('body').innerText();
  const status = panel.match(/(Voice connected|Connected|Reconnecting|Connecting|Connection failed[^\n]*)/);
  console.log(`[call-status] ${status?.[0] ?? 'no status text'}`);
  await page.screenshot({ path: join(userData, 'voice.png') });
  console.log(`[screenshot] ${join(userData, 'voice.png')}`);
  await app.close();
});
