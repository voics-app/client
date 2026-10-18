// Live check: opens Settings → Voice and video at common window widths and reports any element
// that overflows the viewport horizontally (the cause of a horizontal scrollbar).
import { _electron as electron, expect, test } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const BASE = process.env.LIVE_BASE ?? 'http://localhost:18000';

test('voice and video settings fit without horizontal scroll', async () => {
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
  await page.getByLabel('Email').fill('bob@discordy.local', { timeout: 30_000 });
  await page.getByLabel('Password').fill('Discordy-dev-2026!');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('navigation', { name: 'Servers' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /User settings|Settings/ }).first().click();
  await page.getByRole('button', { name: 'Voice and video' }).click();
  await page.waitForTimeout(1_500);

  for (const width of [1280, 1024, 900]) {
    await app.evaluate(({ BrowserWindow }, w) => BrowserWindow.getAllWindows()[0]?.setSize(w, 800), width);
    await page.waitForTimeout(600);
    const report = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const offenders = [...document.querySelectorAll<HTMLElement>('body *')]
        .filter((el) => el.getBoundingClientRect().right > vw + 1 && el.offsetParent !== null)
        .map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')} right=${Math.round(el.getBoundingClientRect().right)} w=${Math.round(el.getBoundingClientRect().width)}`);
      const scrollers = [...document.querySelectorAll<HTMLElement>('body *')]
        .filter((el) => el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== 'hidden' && el.clientWidth > 0)
        .map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')} scrollW=${el.scrollWidth} clientW=${el.clientWidth}`);
      return { vw, offenders: offenders.slice(0, 8), scrollers: scrollers.slice(0, 8) };
    });
    console.log(`[overflow ${width}] vw=${report.vw}\n  offenders: ${report.offenders.join(' | ') || 'none'}\n  scrollers: ${report.scrollers.join(' | ') || 'none'}`);
  }
  await page.screenshot({ path: join(tmpdir(), 'discordy-settings-voice.png') });
  console.log(`[screenshot] ${join(tmpdir(), 'discordy-settings-voice.png')}`);
  await app.close();
});
