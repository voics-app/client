// Opt-in UI acceptance against the existing loopback-only gitops/local stack.
// No accounts or servers are created. The seeded alice user must own its first guild.
import { expect, test } from '@playwright/test';
import { BASE, close, launch, type Instance } from './matrix-helpers';

test('manager uploads a sticker and sends it from the picker; history survives reload', async ({}, testInfo) => {
  test.skip(process.env.STICKER_QA !== '1', 'Set STICKER_QA=1 for the isolated local QA stack.');
  const host = new URL(BASE).hostname;
  if (host !== '127.0.0.1' && host !== 'localhost' && host !== '[::1]') throw new Error('Sticker QA requires a loopback-only isolated stack.');
  let alice: Instance | undefined;
  const fixture: { created?: { url: string; id: string; authorization: string } } = {};
  const name = `qa_sticker_${Date.now()}`;
  try {
    alice = await launch('alice');
    const page = alice.page;
    page.on('response', async (response) => {
      const request = response.request();
      if (request.method() !== 'POST' || !/\/guilds\/[^/]+\/stickers$/.test(new URL(response.url()).pathname) || !response.ok()) return;
      const body = request.postDataJSON() as { name?: string };
      if (body.name !== name) return;
      const sticker = await response.json() as { id: string };
      const authorization = (await request.allHeaders()).authorization;
      if (sticker.id && authorization) fixture.created = { url: response.url(), id: sticker.id, authorization };
    });
    await page.getByRole('navigation', { name: 'Servers' }).locator('button[draggable="true"]').first().click();
    await page.locator('.guild-header').first().click();
    await page.getByRole('menuitem', { name: 'Server settings' }).click();
    await page.locator('.settings-nav').getByRole('button', { name: 'Stickers', exact: true }).click();
    const png = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 320; canvas.height = 320;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas unavailable');
      context.fillStyle = '#8057ce'; context.fillRect(0, 0, 320, 320);
      return canvas.toDataURL('image/png').split(',')[1]!;
    });
    await page.locator('.settings-page input[type="file"]').setInputFiles({ name: `${name}.png`, mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
    await expect(page.getByLabel(`Name of ${name}`)).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ path: testInfo.outputPath('sticker-settings.png') });
    await page.keyboard.press('Escape');
    await page.locator('.channel-row', { hasText: 'general' }).first().click();
    await page.getByRole('button', { name: 'Stickers', exact: true }).click();
    const picker = page.getByRole('dialog', { name: 'Sticker picker' });
    await expect(picker.getByRole('button', { name: `Send ${name}` })).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ path: testInfo.outputPath('sticker-picker.png') });
    await picker.getByRole('button', { name: `Send ${name}` }).click();
    await expect(page.getByRole('img', { name: `Sticker: ${name}` }).last()).toBeVisible({ timeout: 30_000 });
    await page.reload();
    await expect(page.getByRole('navigation', { name: 'Servers' })).toBeVisible({ timeout: 75_000 });
    await page.getByRole('navigation', { name: 'Servers' }).locator('button[draggable="true"]').first().click();
    await page.locator('.channel-row', { hasText: 'general' }).first().click();
    await expect(page.getByRole('img', { name: `Sticker: ${name}` }).last()).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ path: testInfo.outputPath('sticker-history.png') });
  } finally {
    try {
      const created = fixture.created;
      if (alice && created) {
        const response = await alice.page.request.delete(`${created.url}/${encodeURIComponent(created.id)}`, {
          headers: { authorization: created.authorization },
        });
        if (!response.ok() && response.status() !== 404) throw new Error(`Failed to delete fixture sticker ${created.id}: ${response.status()}`);
      }
    } finally {
      await close(alice);
    }
  }
});
