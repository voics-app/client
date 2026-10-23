// Live check (client#156): the guild owner moves a voice member to another voice channel by drag and by the user menu,
// and reorders channels by drag. Not part of CI; run against gitops/local on :18000 with `pnpm exec playwright test -c tests/live/playwright.live.config.ts voice-move-drag`.
import { expect, test } from '@playwright/test';
import { close, ensureUser, launch, rest, type Instance } from './matrix-helpers';

const MEDIA = ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'];

async function openHq(i: Instance): Promise<void> {
  await i.page.getByRole('navigation', { name: 'Servers' }).getByRole('button', { name: 'Discordy HQ' }).click();
}

test('owner moves a voice member by drag and by menu, and reorders channels', async () => {
  test.setTimeout(240_000);
  let alice: Instance | undefined;
  let bob: Instance | undefined;
  try {
    alice = await launch('alice', { chromiumArgs: MEDIA } as never);
    bob = await launch('bob', { chromiumArgs: MEDIA } as never);
    await openHq(alice);
    await openHq(bob);
    await bob.page.getByRole('button', { name: /Lounge/ }).first().click();
    const lounge = alice.page.locator('[data-channel-id="105333024631029760"]');
    const general = alice.page.locator('[data-channel-id="105333024526172164"]');
    await expect(lounge.locator('.occupant', { hasText: 'bob' })).toBeVisible({ timeout: 30_000 });

    // 1. drag bob onto the General voice channel
    await lounge.locator('.occupant', { hasText: 'bob' }).dragTo(general.locator('.channel-row'));
    await expect(general.locator('.occupant', { hasText: 'bob' })).toBeVisible({ timeout: 15_000 });

    // 2. user menu "Move to" back to Lounge
    await general.locator('.occupant', { hasText: 'bob' }).click({ button: 'right' });
    await alice.page.getByRole('menuitem', { name: /Move to/ }).click();
    await alice.page.getByRole('dialog', { name: /Move bob/i }).getByRole('button', { name: 'Lounge' }).click();
    await expect(lounge.locator('.occupant', { hasText: 'bob' })).toBeVisible({ timeout: 15_000 });

    // 3. drag the Lounge channel above the General voice channel's category sibling
    const order = async () => alice!.page.locator('[data-channel-id]').evaluateAll((els) => els.map((e) => e.getAttribute('data-channel-id')));
    const before = await order();
    await lounge.locator('.channel-row').dragTo(general.locator('.channel-row'), { targetPosition: { x: 40, y: 2 } });
    await expect.poll(order, { timeout: 15_000 }).not.toEqual(before);
  } finally {
    console.log([...(alice?.log ?? []), ...(bob?.log ?? [])].filter((l) => /http [45]|pageerror/.test(l)).join('\n'));
    await close(alice, bob);
    // Put the shared seed guild back the way it was.
    const owner = await ensureUser('alice');
    await rest('PATCH', '/guilds/105333024526172160/channels', owner.access_token, [{ id: '105333024631029760', position: 3, parent_id: null }]).catch(() => undefined);
  }
});
