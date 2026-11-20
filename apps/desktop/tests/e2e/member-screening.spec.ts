import { _electron as electron, expect, test } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { startFakeBackend } from './fakeBackend';

test('joins, accepts rules, chooses onboarding and sends the first message', async () => {
  const backend = await startFakeBackend();
  const userData = mkdtempSync(join(tmpdir(), 'screening-e2e-'));
  const env = { ...process.env, DISCORDY_E2E: '1', DISCORDY_USER_DATA_DIR: userData, DISCORDY_API_URL: backend.apiUrl, DISCORDY_GATEWAY_URL: backend.gatewayUrl, DISCORDY_CDN_URL: `${backend.apiUrl}/cdn` } as Record<string, string>;
  delete env.ELECTRON_RENDERER_URL;
  const app = await electron.launch({ args: [resolve(__dirname, '../..')], env });
  try {
    const page = await app.firstWindow();
    await page.getByLabel('Email').fill('ada@example.test');
    await page.getByLabel('Password').fill('correct horse battery');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.getByRole('button', { name: 'Join a server' }).click();
    await page.getByLabel('Invite link or code').fill('screening-fixture');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Accept invite' }).click();
    await expect(page.getByText('Be kind')).toBeVisible();
    const invite = await (await fetch(`${backend.apiUrl}/api/v1/invites/screening-fixture`)).json() as { channel: { id: string } };
    const denied = await fetch(`${backend.apiUrl}/api/v1/channels/${invite.channel.id}/messages`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content: 'before rules' }) });
    expect(denied.status).toBe(403);
    await page.getByRole('checkbox', { name: 'I agree to these rules' }).check();
    await page.getByRole('button', { name: 'Accept rules' }).click();
    await page.getByRole('radio', { name: 'Chat' }).check();
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByText('Welcome to the server')).toBeVisible();
    await page.getByRole('button', { name: 'Say hello' }).click();
    const composer = page.getByRole('textbox', { name: /Message #general/ });
    await composer.fill('first screened message');
    await composer.press('Enter');
    await expect(page.getByRole('log', { name: 'Messages' }).getByText('first screened message')).toBeVisible();
    expect(JSON.stringify([...backend.messages.values()])).toContain('first screened message');
  } finally {
    await app.close();
    await backend.close();
    rmSync(userData, { recursive: true, force: true });
  }
});
