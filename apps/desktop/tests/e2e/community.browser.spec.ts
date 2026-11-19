/** Production renderer in headless Chromium; all REST/gateway traffic stays in this test process. */
import { expect, test } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import type { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import { startFakeBackend, type FakeBackend } from './fakeBackend';

let backend: FakeBackend;
let assets: Server;
let origin: string;

test.beforeEach(async ({ page }) => {
  backend = await startFakeBackend();
  const root = resolve(__dirname, '../../out/renderer');
  assets = createServer(async (req, res) => {
    const path = resolve(root, `.${new URL(req.url ?? '/', 'http://local').pathname === '/' ? '/index.html' : new URL(req.url ?? '/', 'http://local').pathname}`);
    if (!path.startsWith(root + sep)) { res.writeHead(403).end(); return; }
    const mime: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' };
    try { res.setHeader('Content-Type', mime[extname(path)] ?? 'application/octet-stream'); res.end(await readFile(path)); }
    catch { res.writeHead(404).end(); }
  });
  await new Promise<void>((done) => assets.listen(0, '127.0.0.1', done));
  origin = `http://127.0.0.1:${(assets.address() as AddressInfo).port}`;
  await page.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.startsWith('http://127.0.0.1:18000/')) await route.continue({ url: url.replace('http://127.0.0.1:18000', backend.apiUrl) });
    else if (url.startsWith(`${origin}/`)) await route.continue();
    else await route.abort();
  });
  await page.routeWebSocket('**/*', (socket) => {
    if (!socket.url().startsWith('ws://127.0.0.1:18000/')) { void socket.close(); return; }
    const upstream = new WebSocket(socket.url().replace('ws://127.0.0.1:18000', backend.gatewayUrl));
    const pending: (string | Buffer)[] = [];
    socket.onMessage((message) => { if (upstream.readyState === WebSocket.OPEN) upstream.send(message); else pending.push(message); });
    upstream.on('open', () => pending.splice(0).forEach((message) => upstream.send(message)));
    upstream.on('message', (message) => socket.send(String(message)));
    upstream.on('close', () => void socket.close());
    upstream.on('error', () => void socket.close());
    socket.onClose(() => upstream.terminate());
  });
});

test.afterEach(async ({ page }) => {
  await page.close();
  await backend?.close();
  assets?.closeAllConnections();
  await new Promise<void>((done) => assets ? assets.close(() => done()) : done());
});

for (const viewport of [{ width: 1280, height: 900 }, { width: 1000, height: 720 }]) {
  test(`Community setup, retry, disable and public report at ${viewport.width}px`, async ({ page }, info) => {
    await page.setViewportSize(viewport);
    await page.goto(origin);
    await page.getByLabel('Email').fill('ada@example.test');
    await page.getByLabel('Password').fill('local fixture only');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    const rail = page.getByRole('navigation', { name: 'Servers' });
    await rail.getByRole('button', { name: 'Nightglass HQ', exact: true }).click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Server settings', exact: true }).click();
    await page.getByRole('button', { name: 'Discovery', exact: true }).click();
    await page.getByText('Enable Community', { exact: true }).click();
    await expect(page.getByRole('checkbox', { name: 'Enable Community' })).toBeChecked();
    await expect(page.getByRole('button', { name: 'Save Community' })).toBeDisabled();
    await page.getByLabel('Rules channel', { exact: true }).selectOption({ label: '#general' });
    await page.getByLabel('Updates channel', { exact: true }).selectOption({ label: '#general' });
    backend.community.failNextSave = true;
    await page.getByRole('button', { name: 'Save Community' }).click();
    await expect(page.getByRole('alert')).toContainText('Community save interrupted');
    await page.getByRole('button', { name: 'Save Community' }).click();
    await expect(page.getByText('Community settings saved.')).toBeVisible();
    await page.getByLabel('Category', { exact: true }).selectOption('community');
    await page.getByRole('button', { name: 'List in Discover' }).click();
    await expect(page.getByText(/This server is listed in Discover/)).toBeVisible();
    await page.screenshot({ path: info.outputPath('community-settings.png'), fullPage: true });
    await page.getByText('Enable Community', { exact: true }).click();
    await expect(page.getByRole('checkbox', { name: 'Enable Community' })).not.toBeChecked();
    await expect(page.getByText(/remove this server from Discover/)).toBeVisible();
    await page.getByRole('button', { name: 'Save Community' }).click();
    await expect(page.getByText(/This server is not listed/)).toBeVisible();
    await page.getByRole('button', { name: 'Close settings' }).click();
    await rail.getByRole('button', { name: 'Discover servers', exact: true }).click();
    await page.getByRole('button', { name: 'Report Public study hub listing' }).click();
    await expect(page.getByText(/public listing.*Private channels/)).toBeVisible();
    await expect(page.getByRole('checkbox')).toHaveCount(0);
    await page.getByRole('radio', { name: /Spam/ }).check();
    await page.getByLabel('Note (optional)').fill('Public listing review');
    await page.screenshot({ path: info.outputPath('listing-report.png'), fullPage: true });
    await page.getByRole('button', { name: 'Send report' }).click();
    await expect(page.getByRole('dialog', { name: 'Report sent' })).toBeVisible();
    expect(backend.community.reports).toEqual([{ category: 'spam', note: 'Public listing review' }]);
    expect(backend.community.patches.at(-1)).toEqual({ features: [] });
  });
}
