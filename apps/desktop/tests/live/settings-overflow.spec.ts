// Live check: opens every User and Server settings tab at common window widths and reports any element
// that overflows horizontally inside the settings layer (the cause of a horizontal scrollbar).
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const BASE = process.env.LIVE_BASE ?? 'http://127.0.0.1:18000';
const USER_TABS = [
  'My account',
  'Profile',
  'Privacy and delivery',
  'Devices',
  'Voice and video',
  'Keybinds',
  'Appearance',
  'Notifications',
  'Connection',
  'About and updates',
];
const SERVER_TABS = ['Overview', 'Roles', 'Emoji', 'Members', 'Invites', 'Bans', 'Audit log'];
const WIDTHS = process.env.SETTINGS_WIDTHS?.split(',').map(Number) ?? [1280, 1024, 900];

async function measure(page: Page): Promise<{ vw: number; pageOverflow: boolean; contentOverflow: boolean; offenders: string[]; scrollers: string[] }> {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const layer = document.querySelector<HTMLElement>('.settings-layer') ?? document.body;
    const content = document.querySelector<HTMLElement>('.settings-content');
    const limit = content ? content.getBoundingClientRect().right : vw;
    const label = (el: HTMLElement) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`;
    const all = [...layer.querySelectorAll<HTMLElement>('*')];
    const offenders = all
      .filter((el) => el.offsetParent !== null && el.getBoundingClientRect().right > limit + 1)
      .map((el) => `${label(el)} right=${Math.round(el.getBoundingClientRect().right)} limit=${Math.round(limit)}`);
    // Pseudo-element rings (e.g. the avatar speaking ring) inflate scrollWidth without creating a scrollbar, so they are reported separately.
    const scrollers = all
      .filter((el) => el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== 'hidden')
      .map((el) => `${label(el)} scrollW=${el.scrollWidth} clientW=${el.clientWidth}`);
    return {
      vw,
      pageOverflow: document.documentElement.scrollWidth > vw + 1,
      contentOverflow: content ? content.scrollWidth > content.clientWidth + 1 : false,
      offenders: offenders.slice(0, 6),
      scrollers: scrollers.slice(0, 6),
    };
  });
}

async function hasServerSettings(page: Page): Promise<boolean> {
  const guild = page.getByRole('navigation', { name: 'Servers' }).locator('button[draggable="true"]').first();
  if (!(await guild.count())) return false;
  await guild.click();
  await page.locator('.guild-header').first().click();
  const found = (await page.getByRole('menuitem', { name: 'Server settings' }).count()) > 0;
  await page.keyboard.press('Escape');
  return found;
}

test('every user and server settings tab fits without horizontal scroll', async () => {
  const app: ElectronApplication = await electron.launch({
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

  const failures: string[] = [];
  const check = async (scope: string, tab: string) => {
    await page.locator('.settings-nav').getByRole('button', { name: tab, exact: true }).click();
    await page.waitForTimeout(800);
    for (const width of WIDTHS) {
      await app.evaluate(({ BrowserWindow }, w) => BrowserWindow.getAllWindows()[0]?.setSize(w, 800), width);
      await page.waitForTimeout(500);
      const r = await measure(page);
      const line = `[${scope} / ${tab} @${width}] vw=${r.vw} pageOverflow=${r.pageOverflow} contentOverflow=${r.contentOverflow}\n  offenders: ${r.offenders.join(' | ') || 'none'}\n  scrollers: ${r.scrollers.join(' | ') || 'none'}`;
      console.log(line);
      if (r.pageOverflow || r.contentOverflow || r.offenders.length > 0) failures.push(line);
    }
  };

  await page.getByRole('button', { name: /User settings|Settings/ }).first().click();
  for (const tab of USER_TABS) await check('user', tab);

  await page.keyboard.press('Escape');
  if (!(await hasServerSettings(page))) {
    // Bob owns no server by default, so create one to get the owner-only Server settings tabs.
    await page.getByRole('button', { name: 'Create a server' }).click();
    await page.getByLabel('Server name').fill('Overflow probe');
    await page.getByRole('button', { name: 'Create server' }).click();
    await expect(page.locator('.guild-header-name', { hasText: 'Overflow probe' })).toBeVisible({ timeout: 30_000 });
  }
  await page.locator('.guild-header').first().click();
  await page.getByRole('menuitem', { name: 'Server settings' }).click();
  for (const tab of SERVER_TABS) {
    if (await page.locator('.settings-nav').getByRole('button', { name: tab, exact: true }).count()) await check('server', tab);
  }
  await app.close();
  expect(failures, failures.join('\n')).toEqual([]);
});
