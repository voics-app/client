// Visual check for client#94 (not committed): one throwaway production account creates a server, joins its voice
// channel, and the user panel, device quick menus, connection details popover and noise suppression toggle are
// screenshotted. Cleanup deletes the server and schedules the account for deletion.
import { _electron as electron, expect, test } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const API = 'https://api.voics.nl';
const PASSWORD = 'E2e-Visual-Test-2026!';
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e3)}`;
const OUT = process.env.SHOTS ?? tmpdir();

async function rest<T>(method: string, path: string, token: string | null, body?: unknown): Promise<T> {
  const res = await fetch(`${API}/api/v1${path}`, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${(await res.text()).slice(0, 200)}`);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

test('voice panel visual check', async () => {
  test.setTimeout(300_000);
  const env: Record<string, string> = { ...(process.env as Record<string, string>), DISCORDY_USER_DATA_DIR: mkdtempSync(join(tmpdir(), 'discordy-vis-')), ELECTRON_RENDERER_URL: '' };
  for (const k of ['DISCORDY_API_URL', 'DISCORDY_GATEWAY_URL', 'DISCORDY_CDN_URL']) delete env[k];
  const app = await electron.launch({ args: [resolve(__dirname, '../..'), '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'], env });
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1280, height: 800 }).catch(() => undefined);
  const email = `discordy-e2e-${RUN}-vis@example.com`;
  let token = ''; let guildId = '';
  const shot = async (name: string) => { await page.waitForTimeout(600); await page.screenshot({ path: join(OUT, `${name}.png`) }); console.log(`[shot] ${name}`); };
  try {
    await page.getByRole('radio', { name: 'Create account' }).or(page.getByRole('button', { name: 'Create account' })).first().click({ timeout: 30_000 });
    await page.getByLabel('Email', { exact: true }).last().fill(email);
    await page.getByLabel('Username').last().fill(`vis${RUN}`.slice(0, 30));
    await page.getByLabel('Password', { exact: true }).last().fill(PASSWORD);
    await page.getByRole('button', { name: 'Create account' }).last().click();
    await expect(page.getByRole('navigation', { name: 'Servers' })).toBeVisible({ timeout: 60_000 });
    token = (await rest<{ access_token: string }>('POST', '/auth/login', null, { email, password: PASSWORD })).access_token;
    const g = await rest<{ id: string }>('POST', '/guilds', token, { name: `vis-${RUN}` }); guildId = g.id;
    const chans = await rest<{ id: string; name: string; type: number }[]>('GET', `/guilds/${guildId}/channels`, token);
    const voice = chans.find((c) => c.type === 2);
    console.log(`[info] voice channel: ${voice?.name}`);
    await page.waitForTimeout(3_000);
    await page.getByRole('navigation', { name: 'Servers' }).getByRole('button', { name: new RegExp(`vis-${RUN}`) }).click({ timeout: 20_000 });
    await shot('01-server-before-join');
    await page.getByRole('button', { name: new RegExp(voice?.name ?? 'General') }).last().click();
    await page.getByText(/Voice connected|Connecting/).first().waitFor({ timeout: 30_000 }).catch(() => undefined);
    await page.waitForTimeout(3_000);
    await shot('02-joined-user-area-and-dock');
    for (const heading of ['Input device', 'Output device', 'Camera']) {
      const btn = page.getByRole('button', { name: `${heading} and options` }).first();
      if (await btn.count()) { await btn.click(); await shot(`03-menu-${heading.replace(' ', '-').toLowerCase()}`); await page.keyboard.press('Escape'); }
      else console.log(`[missing] ${heading} and options`);
    }
    const conn = page.getByRole('button', { name: 'Connection details' }).first();
    if (await conn.count()) { await conn.click(); await page.waitForTimeout(2_500); await shot('04-connection-details'); await page.keyboard.press('Escape'); } else console.log('[missing] Connection details');
    const ns = page.getByRole('button', { name: /Noise suppression/ }).first();
    if (await ns.count()) { await ns.hover(); await shot('05-noise-suppression-hover'); } else console.log('[missing] Noise suppression');
    await page.getByRole('button', { name: /^Mute|Unmute/ }).first().hover().catch(() => undefined); await shot('06-mute-tooltip-keybind');
  } finally {
    if (guildId) await rest('DELETE', `/guilds/${guildId}`, token).catch((e) => console.log(`cleanup guild: ${(e as Error).message}`));
    if (token) await rest('POST', '/users/@me/delete', token, { password: PASSWORD }).then(() => console.log('account delete scheduled')).catch((e) => console.log(`cleanup account: ${(e as Error).message}`));
    await app.close().catch(() => undefined);
  }
});
