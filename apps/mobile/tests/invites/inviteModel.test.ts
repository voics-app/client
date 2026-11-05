import { ChannelType, type Channel } from '@discordy/core/contracts/rest';
import { inviteChannelId, inviteSummary } from '../../src/invites/inviteModel';

const ch = (id: string, type: number, position: number, guild = 'g1') => ({ id, type, position, guild_id: guild, name: id }) as Channel;

describe('inviteChannelId', () => {
  it('is the first text channel of the server by position', () => {
    const channels = Object.fromEntries([ch('b', ChannelType.GUILD_TEXT, 2), ch('a', ChannelType.GUILD_TEXT, 1), ch('v', ChannelType.GUILD_VOICE, 0), ch('x', ChannelType.GUILD_TEXT, 0, 'g2')].map((c) => [c.id, c]));
    expect(inviteChannelId(channels, 'g1')).toBe('a');
  });

  it('is null when there is no text channel', () => {
    expect(inviteChannelId({ v: ch('v', ChannelType.GUILD_VOICE, 0) }, 'g1')).toBeNull();
  });
});

describe('inviteSummary', () => {
  it('says who made it, how often it was used and that it never expires', () => {
    expect(inviteSummary({ code: 'abc', uses: 2, max_uses: 5 }, 'Pat')).toBe('by Pat · 2/5 uses · never expires');
  });

  it('shows the expiry time when there is one and leaves out an unknown inviter', () => {
    const text = inviteSummary({ code: 'abc', expires_at: '2030-01-01T00:00:00Z' }, null);
    expect(text.startsWith('0 uses · expires ')).toBe(true);
  });
});
