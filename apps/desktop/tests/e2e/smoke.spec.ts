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

test('favourites a friend and opens a personal friend invite', async () => {
  await page.getByRole('button', { name: 'Friends', exact: false }).first().click();
  await page.getByRole('tab', { name: /All/ }).click();
  await page.getByRole('button', { name: 'Add favourite' }).click();
  await expect(page.getByRole('button', { name: 'Remove favourite' })).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Direct messages' }).getByText('Favourites')).toBeVisible();
  await page.getByRole('tab', { name: /Add friend/ }).click();
  await page.getByRole('button', { name: 'Create link' }).click();
  const link = await page.getByLabel('Friend invite link').inputValue();
  expect(link).toMatch(/\/friend-invite\/#/);
  const appLink = `voics://friend-invite/${new URL(link).hash.slice(1)}`;
  await app.evaluate(({ app }, url) => app.emit('open-url', { preventDefault() {} } as Electron.Event, url), appLink);
  await expect.poll(() => backend.friendRequests.length).toBe(1);
  await page.getByRole('button', { name: 'Revoke link' }).click();
  await app.evaluate(({ app }, url) => app.emit('open-url', { preventDefault() {} } as Electron.Event, url), appLink);
  await expect(page.getByText('Could not send friend request')).toBeVisible();
  expect(backend.friendRequests).toHaveLength(1);
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

test('runs slash commands and renders interaction responses', async () => {
  const log = page.getByRole('log', { name: 'Messages' });
  const composer = page.getByRole('textbox', { name: /Message #general/ });
  const commands = page.getByRole('listbox', { name: 'Commands' });

  await composer.fill('/rol');
  await commands.getByRole('option', { name: /\/roll/ }).click();
  await page.getByLabel('sides', { exact: true }).fill('20');
  await page.getByLabel('mode', { exact: true }).selectOption('max');
  await page.getByRole('button', { name: 'Run command' }).click();
  await expect(log.getByText('Dice Bot is thinking')).toBeVisible({ timeout: 10_000 });
  await expect(log.getByText('You rolled a 20')).toBeVisible({ timeout: 15_000 });
  await expect(log.getByText('Dice Bot is thinking')).toBeHidden();
  expect(backend.interactions.at(-1)).toMatchObject({ type: 2, data: { name: 'roll', options: [{ name: 'sides', value: 20 }, { name: 'mode', value: 'max' }] } });

  await log.getByRole('button', { name: 'Roll again' }).click();
  await expect(log.getByText('Component again pressed')).toBeVisible({ timeout: 15_000 });
  expect(backend.interactions.at(-1)).toMatchObject({ type: 3, data: { custom_id: 'again', component_type: 2 } });

  await log.getByRole('combobox', { name: 'Pick a die' }).first().selectOption('d20');
  await expect(log.getByText('Component pick chose d20')).toBeVisible({ timeout: 15_000 });

  await composer.fill('/secret');
  await commands.getByRole('option', { name: /\/secret/ }).click();
  await page.getByRole('button', { name: 'Run command' }).click();
  await expect(log.getByText('Only you can see this')).toBeVisible({ timeout: 15_000 });

  await composer.fill('/feedback');
  await commands.getByRole('option', { name: /\/feedback/ }).click();
  await page.getByRole('button', { name: 'Run command' }).click();
  const modal = page.getByRole('dialog', { name: 'Send feedback' });
  await expect(modal).toBeVisible({ timeout: 15_000 });
  await modal.getByLabel('Your thoughts').fill('lovely');
  await modal.getByRole('button', { name: 'Submit' }).click();
  await expect(log.getByText('Thanks for the feedback: lovely')).toBeVisible({ timeout: 15_000 });
  expect(backend.interactions.at(-1)).toMatchObject({ type: 5, data: { custom_id: 'feedback-form' } });
});

test('the delivery mode badge is always visible', async () => {
  await expect(page.getByRole('status', { name: /Delivery mode: Standard/ })).toBeVisible();
});

test('creates a guild', async () => {
  await page.getByRole('button', { name: 'Create a server' }).click();
  await page.getByRole('button', { name: 'Create My Own' }).click();
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
