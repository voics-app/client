import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { startFakeBackend, type FakeBackend } from './fakeBackend';

let backend: FakeBackend;
let app: ElectronApplication;
let page: Page;
let userData: string;

test.beforeAll(async () => {
  backend = await startFakeBackend();
  userData = mkdtempSync(join(tmpdir(), 'voics-streamer-e2e-'));
  const env = { ...process.env, DISCORDY_E2E: '1', DISCORDY_USER_DATA_DIR: userData, DISCORDY_API_URL: backend.apiUrl, DISCORDY_GATEWAY_URL: backend.gatewayUrl, DISCORDY_CDN_URL: `${backend.apiUrl}/cdn` } as Record<string, string>;
  delete env.ELECTRON_RENDERER_URL;
  app = await electron.launch({ args: [resolve(__dirname, '../..')], env });
  page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
});

test.afterAll(async () => {
  await app?.close();
  await backend?.close();
  if (userData) {
    const target = realpathSync(userData);
    if (dirname(target) !== realpathSync(tmpdir())) throw new Error('Refusing to remove a profile outside the temporary directory');
    rmSync(target, { recursive: true, force: true });
  }
});

test('hides and restores account email and generated invite through the settings and keybind', async () => {
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible({ timeout: 30_000 });
  await page.getByLabel('Email').fill('ada@example.test');
  await page.getByLabel('Password').fill('correct horse battery');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('navigation', { name: 'Servers' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'User settings' }).click();
  await expect(page.getByText('ada@example.test').first()).toBeVisible();
  await page.getByRole('button', { name: 'Notifications', exact: true }).click();
  await page.getByRole('switch', { name: 'Streamer mode' }).click();
  await page.getByRole('button', { name: 'My account', exact: true }).click();
  await expect(page.getByText('ada@example.test')).toHaveCount(0);
  await expect(page.getByText('Hidden in streamer mode').first()).toBeVisible();
  await page.getByRole('button', { name: 'Keybinds', exact: true }).click();
  await page.getByRole('button', { name: 'Change shortcut for Toggle streamer mode' }).click();
  await page.keyboard.press('Control+Alt+Q');
  await expect(page.getByRole('button', { name: 'Change shortcut for Toggle streamer mode' })).toContainText('Ctrl+Alt+Q');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Nightglass HQ' }).click();
  await page.getByRole('button', { name: 'general', exact: true }).hover();
  await page.getByRole('button', { name: 'Create invite' }).first().click();
  await page.getByRole('button', { name: 'Generate invite link' }).click();
  const input = page.getByRole('dialog').getByRole('textbox');
  await expect(input).toHaveValue('Hidden in streamer mode');
  await page.keyboard.press('Control+Alt+Q');
  await expect(input).toHaveValue(/smoke-private-invite/);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'User settings' }).click();
  await expect(page.getByText('ada@example.test').first()).toBeVisible();
});
