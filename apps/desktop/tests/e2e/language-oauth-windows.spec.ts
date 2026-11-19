import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { startFakeBackend } from './fakeBackend';

test('authenticated language persists and Windows protocol links open consent', async () => {
  test.setTimeout(180_000);
  const backend = await startFakeBackend();
  const userData = mkdtempSync(join(tmpdir(), 'voics-language-oauth-'));
  const env = { ...process.env, DISCORDY_E2E: '1', DISCORDY_REGISTER_DEV_PROTOCOL: '1', DISCORDY_USER_DATA_DIR: userData, DISCORDY_API_URL: backend.apiUrl, DISCORDY_GATEWAY_URL: backend.gatewayUrl, DISCORDY_CDN_URL: `${backend.apiUrl}/cdn` } as Record<string, string>;
  delete env.ELECTRON_RENDERER_URL;
  let app: ElectronApplication | undefined;
  const launch = async (): Promise<Page> => {
    app = await electron.launch({ args: [resolve(__dirname, '../..')], env });
    const page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    return page;
  };
  try {
    let page = await launch();
    await page.getByLabel('Email').fill('ada@example.test');
    await page.getByLabel('Password').fill('correct horse battery');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('navigation', { name: 'Servers' })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'User settings' }).click();
    await page.getByRole('button', { name: 'Language', exact: true }).click();
    await page.getByRole('combobox', { name: 'App language' }).selectOption('nl');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('heading', { name: 'Taal', exact: true })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'nl');
    await app!.close();
    page = await launch();
    await expect(page.getByRole('navigation', { name: /Servers/ })).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('html')).toHaveAttribute('lang', 'nl');
    for (const scheme of ['voics', 'discordy']) {
      const url = `${scheme}://oauth2/authorize?client_id=11&scope=bot%20applications.commands&permissions=2048`;
      const command = Buffer.from(`Start-Process '${url}'`, 'utf16le').toString('base64');
      execFileSync('powershell.exe', ['-NoProfile', '-EncodedCommand', command], { env });
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: 30_000 });
      await expect(dialog.getByText('Study helper')).toBeVisible();
      await expect(dialog.getByText('Fixture app')).toBeVisible();
      await dialog.getByRole('button', { name: /Annuleren|Cancel/ }).click();
      await expect(dialog).toBeHidden();
    }
  } finally {
    await app?.close();
    await backend.close();
    rmSync(userData, { recursive: true, force: true });
  }
});
