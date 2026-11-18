import { expect, test, type Page } from '@playwright/test';

const entry = '/tests/fixtures/localization/';
async function fits(page: Page) {
  const sizes = await page.locator('.settings, .settings-nav, .settings-content, .settings-inner').evaluateAll(nodes => nodes.map(node => ({ name: node.className, width: node.clientWidth, scroll: node.scrollWidth })));
  for (const size of sizes) expect(size.scroll, size.name).toBeLessThanOrEqual(size.width + 1);
  const close = page.getByRole('button', { name: 'Instellingen sluiten' });
  const box = await close.boundingBox();
  expect(box).toBeTruthy();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(940);
}

test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.goto(entry);
  await expect(page.getByRole('heading', { name: 'Taal', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Geautoriseerde apps', exact: true })).toBeVisible();
  expect(await page.evaluate(async () => { await document.fonts.ready; return document.fonts.check('14px "Inter Variable"'); })).toBe(true);
});

test('Dutch minimum-size language settings retain failed selection, save the real locale field, and update the document', async ({ page }, info) => {
  await fits(page);
  await page.screenshot({ path: info.outputPath('language-nl-minimum.png') });
  const select = page.getByRole('combobox');
  await select.selectOption('en-US');
  await page.request.get('/fixture/fail');
  await page.getByRole('button', { name: 'Wijzigingen opslaan' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(select).toHaveValue('en-US');
  await expect(page.locator('html')).toHaveAttribute('lang', 'nl');
  await page.getByRole('button', { name: 'Wijzigingen opslaan' }).click();
  await expect(page.getByRole('heading', { name: 'Language', exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en-US');
  const writes = await (await page.request.get('/fixture/writes')).json();
  expect(writes.slice(-2)).toEqual([{ locale: 'en-US' }, { locale: 'en-US' }]);
});

test('Dutch profile controls and mixed-direction authored text fit at the supported minimum, including forced RTL', async ({ page }, info) => {
  await page.getByRole('button', { name: 'Profiel', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Profiel', exact: true })).toBeVisible();
  await fits(page);
  const bio = page.locator('textarea').first();
  await expect(bio).toHaveValue('Original words remain original. مرحبا 👩🏽‍💻');
  await expect(page.locator('.profile-preview .selectable')).toHaveAttribute('dir', 'auto');
  await expect(bio).toHaveAttribute('dir', 'auto');
  await page.screenshot({ path: info.outputPath('profile-nl-minimum.png') });
  await page.evaluate(() => { document.documentElement.dir = 'rtl'; });
  await fits(page);
  await expect(bio).toHaveValue('Original words remain original. مرحبا 👩🏽‍💻');
  await page.screenshot({ path: info.outputPath('profile-forced-rtl-minimum.png') });
  await page.getByRole('button', { name: 'Instellingen sluiten' }).focus();
  await expect(page.getByRole('button', { name: 'Instellingen sluiten' })).toBeFocused();
});
