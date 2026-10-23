// Live check (client#157): rail badges are not clipped by the rail, and the empty title-bar area is a window drag region.
// Not part of CI; run against gitops/local on :18000.
import { expect, test } from '@playwright/test';
import { close, ensureUser, launch, rest } from './matrix-helpers';

test('rail badges are fully visible and the title bar right of the search pill drags', async () => {
  test.setTimeout(120_000);
  const [alice, bob] = await Promise.all([ensureUser('alice'), ensureUser('bob')]);
  const chans = await rest<{ id: string; type: number; name: string }[]>('GET', '/guilds/105333024526172160/channels', bob.access_token);
  const general = chans.find((c) => c.type === 0 && c.name === 'general')!;
  const app = await launch('alice');
  try {
    for (let i = 0; i < 3; i += 1) await rest('POST', `/channels/${general.id}/messages`, bob.access_token, { content: `<@${alice.user.id}> badge check ${i}` });
    const rail = app.page.getByRole('navigation', { name: 'Servers' });
    const badge = rail.locator('.rail-badge').first();
    await expect(badge).toBeVisible({ timeout: 20_000 });
    await app.page.screenshot({ path: 'test-results/rail-badge.png', clip: { x: 0, y: 0, width: 160, height: 400 } });
    // The badge, including its 3px ring, must lie inside the rail's visible scroll area.
    const fit = await app.page.evaluate(() => {
      const b = document.querySelector('.rail-badge')!.getBoundingClientRect();
      const scroller = document.querySelector('.rail-scroll')!.getBoundingClientRect();
      return { left: b.left - 3 - scroller.left, right: scroller.right - (b.right + 3), top: b.top - 3 - scroller.top, bottom: scroller.bottom - (b.bottom + 3) };
    });
    expect(Math.min(fit.left, fit.right, fit.top, fit.bottom)).toBeGreaterThanOrEqual(0);

    const regions = await app.page.evaluate(() => {
      const region = (el: Element | null) => (el ? getComputedStyle(el).getPropertyValue('-webkit-app-region') : 'none');
      const end = document.querySelector('.titlebar-end')!;
      const probe = document.elementFromPoint(end.getBoundingClientRect().left + 20, 10);
      return { end: region(end), probe: region(probe), pill: region(document.querySelector('.palette-pill')), icon: region(document.querySelector('.titlebar-icon')) };
    });
    expect(regions).toEqual({ end: 'drag', probe: 'drag', pill: 'no-drag', icon: 'no-drag' });
  } finally {
    await close(app);
  }
});
