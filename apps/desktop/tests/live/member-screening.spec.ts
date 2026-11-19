// Run only against an isolated QA stack with the API, messages, gateway and client PR heads.
import { expect, test } from '@playwright/test';
import { BASE, close, ensureUser, launch, rest, say, sees, stamp, type Instance } from './matrix-helpers';

test('a new member accepts current rules before sending the first message', async () => {
  test.setTimeout(240_000);
  const id = stamp();
  const owner = await ensureUser(`sco${id}`);
  const guest = await ensureUser(`scg${id}`);
  const guild = await rest<{ id: string }>('POST', '/guilds', owner.access_token, { name: `screen${id}` });
  const channels = await rest<{ id: string; type: number }[]>('GET', `/guilds/${guild.id}/channels`, owner.access_token);
  const channel = channels.find((entry) => entry.type === 0)!;
  await rest('PUT', `/guilds/${guild.id}/member-verification`, owner.access_token, { enabled: true, rules: ['Be kind'] });
  const invite = await rest<{ code: string }>('POST', `/channels/${channel.id}/invites`, owner.access_token, {});
  const all: Instance[] = [];
  try {
    const a = await launch('screen-owner', { user: owner.user.username });
    const b = await launch('screen-guest', { user: guest.user.username });
    all.push(a, b);
    await b.page.getByRole('button', { name: 'Join a server' }).click();
    await b.page.getByLabel('Invite link or code').fill(invite.code);
    await b.page.getByRole('button', { name: 'Continue' }).click();
    await b.page.getByRole('button', { name: 'Accept invite' }).click();
    await expect(b.page.getByText('Be kind')).toBeVisible();
    const rejected = await fetch(`${BASE}/api/v1/channels/${channel.id}/messages`, {
      method: 'POST', headers: { authorization: `Bearer ${guest.access_token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ content: 'before rules' }),
    });
    expect(rejected.status).toBe(403);
    await b.page.getByRole('checkbox', { name: 'I agree to these rules' }).check();
    await b.page.getByRole('button', { name: 'Accept rules' }).click();
    await a.page.getByRole('navigation', { name: 'Servers' }).getByRole('button', { name: `screen${id}` }).click();
    const text = `first message ${id}`;
    await say(b.page, text);
    expect(await sees(a.page, text)).toBe(true);
  } finally { await close(...all); }
});
