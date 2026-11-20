import { _electron as electron, expect, test } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { startFakeBackend } from './fakeBackend';

test('browses, joins and archives a synthetic thread', async ({}, testInfo) => {
  const backend = await startFakeBackend();
  const userData = mkdtempSync(join(tmpdir(), 'voics-threads-e2e-'));
  const env = {
    ...process.env,
    DISCORDY_E2E: '1',
    DISCORDY_USER_DATA_DIR: userData,
    DISCORDY_API_URL: backend.apiUrl,
    DISCORDY_GATEWAY_URL: backend.gatewayUrl,
    DISCORDY_CDN_URL: `${backend.apiUrl}/cdn`,
  } as Record<string, string>;
  delete env.ELECTRON_RENDERER_URL;
  const app = await electron.launch({ args: [resolve(__dirname, '../..')], env });
  try {
    const page = await app.firstWindow();
    await page.getByLabel('Email').fill('ada@example.test');
    await page.getByLabel('Password').fill('correct horse battery');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.getByRole('button', { name: 'Nightglass HQ' }).click();
    await page.getByRole('button', { name: /general/ }).first().click();
    await page.getByRole('button', { name: 'Threads', exact: true }).click();
    await expect(page.getByRole('button', { name: /Working notes/ })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('threads-active.png') });
    await page.getByRole('button', { name: /Working notes/ }).click();
    await page.getByRole('button', { name: 'Thread actions' }).click();
    await page.getByRole('menuitem', { name: 'Join thread' }).click();
    await expect.poll(async () => {
      await page.getByRole('button', { name: 'Thread actions' }).click();
      const joined = await page.getByRole('menuitem', { name: 'Leave thread' }).count();
      if (!joined) await page.keyboard.press('Escape');
      return joined;
    }).toBe(1);
    await page.getByRole('menuitem', { name: 'Archive thread' }).click();
    await expect(page.getByText('This thread is archived.')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('thread-archived.png') });
  } finally {
    await app.close();
    await backend.close();
    rmSync(userData, { recursive: true, force: true });
  }
});
