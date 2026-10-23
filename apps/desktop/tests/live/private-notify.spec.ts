// Live check (client#154): a message that arrives over Ephemeral (E2EE relay) or P2P must raise the same unread state and
// desktop notification as a Standard one, without the plaintext reaching the OS notification. Not part of CI; run on :18000.
import { expect, test } from '@playwright/test';
import { close, composer, ensureUser, launch, rest, say, setMode, stamp, type Instance, type Mode } from './matrix-helpers';

async function recordNotifications(i: Instance): Promise<void> {
  await i.app.evaluate(({ ipcMain }) => {
    const g = globalThis as unknown as { __notes?: { title: string; body: string }[] };
    g.__notes = [];
    ipcMain.on('app:notify', (_e, req: { title: string; body: string }) => g.__notes!.push(req));
  });
}
const notes = (i: Instance) => i.app.evaluate(() => (globalThis as unknown as { __notes?: { title: string; body: string }[] }).__notes ?? []);

for (const mode of ['standard', 'ephemeral', 'p2p'] as Mode[]) {
  test(`${mode} DM raises unread and a notification on the receiving client`, async () => {
    test.setTimeout(180_000);
    const [alice, bob] = await Promise.all([ensureUser('alice'), ensureUser('bob')]);
    const dm = await rest<{ id: string }>('POST', '/users/@me/channels', alice.access_token, { recipient_ids: [bob.user.id] });
    // Seed bob is on Do Not Disturb, which (correctly) silences notifications.
    const prior = await rest<{ status: string }>('GET', '/users/@me/settings', bob.access_token);
    await rest('PATCH', '/users/@me/settings', bob.access_token, { status: 'online' });
    await setMode(alice.access_token, dm.id, mode === 'standard' ? null : mode);
    const a = await launch('alice');
    const b = await launch('bob');
    try {
      await recordNotifications(b);
      // Alice opens the DM; bob stays on the Home screen, looking at a different place.
      await a.page.getByRole('navigation', { name: 'Servers' }).getByRole('button').first().click();
      await a.page.locator('.dm-row', { hasText: 'bob' }).first().click({ timeout: 20_000 });
      await b.page.getByRole('navigation', { name: 'Servers' }).getByRole('button').first().click();
      await expect(composer(a.page)).toBeVisible();
      const text = `secret ${mode} ${stamp()}`;
      await say(a.page, text);
      await expect(b.page.locator('.dm-row.is-unread', { hasText: 'alice' })).toBeVisible({ timeout: 60_000 });
      await expect.poll(async () => (await notes(b)).length, { timeout: 15_000 }).toBeGreaterThan(0);
      const sent = (await notes(b)).at(-1)!;
      expect(sent.title).toContain('alice');
      if (mode === 'standard') expect(sent.body).toContain(text);
      else expect(JSON.stringify(sent)).not.toContain(text);
    } finally {
      await close(a, b);
      await rest('PATCH', '/users/@me/settings', bob.access_token, { status: prior.status }).catch(() => undefined);
    }
  });
}
