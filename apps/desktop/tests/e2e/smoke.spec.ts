import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { startFakeBackend, type FakeBackend } from './fakeBackend';

let backend: FakeBackend;
let app: ElectronApplication;
let page: Page;
let userData: string;

test.beforeAll(async () => {
  backend = await startFakeBackend();
  userData = mkdtempSync(join(tmpdir(), 'discordy-e2e-'));
  const env = {
    ...process.env,
    DISCORDY_E2E: '1',
    DISCORDY_USER_DATA_DIR: userData,
    DISCORDY_API_URL: backend.apiUrl,
    DISCORDY_GATEWAY_URL: backend.gatewayUrl,
    DISCORDY_CDN_URL: `${backend.apiUrl}/cdn`,
  } as Record<string, string>;
  delete env.ELECTRON_RENDERER_URL;
  app = await electron.launch({ args: [resolve(__dirname, '../..')], env });
  page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
});

test.afterAll(async () => {
  await app?.close();
  await backend?.close();
  rmSync(userData, { recursive: true, force: true });
});

test('signs in and lands in the server shell', async () => {
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible({ timeout: 30_000 });
  await page.getByLabel('Email').fill('ada@example.test');
  await page.getByLabel('Password').fill('correct horse battery');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('navigation', { name: 'Servers' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Nightglass HQ' })).toBeVisible();
});

test('sends a message in a channel', async () => {
  await page.getByRole('button', { name: 'Nightglass HQ' }).click();
  await page.getByRole('button', { name: /general/ }).first().click();
  const composer = page.getByRole('textbox', { name: /Message #general/ });
  await composer.fill('hello from playwright');
  await composer.press('Enter');
  await expect(page.getByRole('log', { name: 'Messages' }).getByText('hello from playwright')).toBeVisible({ timeout: 15_000 });
  expect(JSON.stringify([...backend.messages.values()])).toContain('hello from playwright');
});

test('the delivery mode badge is always visible', async () => {
  await expect(page.getByRole('status', { name: /Delivery mode: Standard/ })).toBeVisible();
});

test('creates a guild', async () => {
  await page.getByRole('button', { name: 'Create a server' }).click();
  await page.getByLabel('Server name').fill('Playwright Palace');
  await page.getByRole('button', { name: 'Create server' }).click();
  await expect(page.getByRole('navigation', { name: 'Servers' }).getByRole('button', { name: 'Playwright Palace' })).toBeVisible({ timeout: 15_000 });
});

test('opens the command palette with the keyboard', async () => {
  await page.keyboard.press('Control+K');
  await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible();
  await page.keyboard.press('Escape');
});

test('renders the component gallery', async () => {
  await page.evaluate(() => {
    // Runs in the renderer; the e2e tsconfig has no DOM lib, so type the bit we touch.
    const { location } = globalThis as unknown as { location: { hash: string } };
    location.hash = '#/__gallery';
  });
  await expect(page.getByRole('heading', { name: 'Component gallery' })).toBeVisible({ timeout: 15_000 });
});
