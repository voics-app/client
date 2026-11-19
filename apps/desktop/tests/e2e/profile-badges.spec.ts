import { _electron as electron, expect, test } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { startFakeBackend } from './fakeBackend';

test('profile settings hide one badge from the public profile after reload', async () => {
  test.setTimeout(120_000);
  const backend = await startFakeBackend();
  const userData = mkdtempSync(join(tmpdir(), 'voics-badges-e2e-'));
  const env = { ...process.env, DISCORDY_E2E: '1', DISCORDY_USER_DATA_DIR: userData,
    DISCORDY_API_URL: backend.apiUrl, DISCORDY_GATEWAY_URL: backend.gatewayUrl,
    DISCORDY_CDN_URL: `${backend.apiUrl}/cdn` } as Record<string, string>;
  delete env.ELECTRON_RENDERER_URL;
  const app = await electron.launch({ args: [resolve(__dirname, '../..')], env });
  try {
    const page = await app.firstWindow();
    await page.getByLabel('Email').fill('ada@example.test', { timeout: 30_000 });
    await page.getByLabel('Password').fill('correct horse battery');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('navigation', { name: 'Servers' })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'User settings' }).click();
    await page.getByRole('button', { name: 'Edit profile' }).click();
    const first = page.getByRole('switch', { name: 'Show Fixture one on your profile' });
    await expect(first).toHaveAttribute('aria-checked', 'true');
    await first.click();
    await expect(first).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByRole('switch', { name: 'Show Fixture two on your profile' })).toHaveAttribute('aria-checked', 'true');
    await page.getByRole('button', { name: 'Close settings' }).click();
    await page.reload();
    await expect(page.getByRole('navigation', { name: 'Servers' })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Nightglass HQ' }).click();
    await page.getByRole('button', { name: /general/ }).first().click();
    const members = page.getByRole('complementary', { name: 'Members' });
    if (!await members.isVisible()) await page.getByRole('button', { name: 'Member list' }).click();
    await members.getByRole('button', { name: /Ada Lovelace/ }).click();
    const publicBadges = page.getByRole('region', { name: 'Badges' });
    await expect(publicBadges.getByText('Fixture two')).toBeVisible();
    await expect(publicBadges.getByText('Fixture one')).toHaveCount(0);
  } finally {
    await app.close();
    await backend.close();
    rmSync(userData, { recursive: true, force: true });
  }
});
