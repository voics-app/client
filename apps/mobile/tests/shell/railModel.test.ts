import type { Channel, GuildNotificationSettings } from '@discordy/core/contracts/rest';
import { ChannelType } from '@discordy/core/contracts/rest';
import { channelFlags, dmMentionTotal, guildActivity, initialsOf } from '../../src/shell/railModel';

const text = (id: string, guild: string, last: string | null, extra: Partial<Channel> = {}): Channel =>
  ({ id, type: ChannelType.GUILD_TEXT, guild_id: guild, nsfw: false, name: id, last_message_id: last, ...extra }) as Channel;
const byId = (...list: Channel[]) => Object.fromEntries(list.map((c) => [c.id, c]));
const noSettings = () => undefined;
const NOW = 1_000;

describe('guildActivity', () => {
  it('is unread when a text channel has messages past its read marker', () => {
    const channels = byId(text('c1', 'g1', '200'));
    expect(guildActivity(channels, { c1: { lastReadId: '100', mentionCount: 0 } }, noSettings, new Set(['g1']), NOW)).toEqual({ unread: true, mentions: 0 });
    expect(guildActivity(channels, { c1: { lastReadId: '200', mentionCount: 0 } }, noSettings, new Set(['g1']), NOW).unread).toBe(false);
  });

  it('counts mentions per server and ignores other servers and voice channels', () => {
    const channels = byId(text('c1', 'g1', null), text('c2', 'g2', null), text('v1', 'g1', null, { type: ChannelType.GUILD_VOICE }));
    const reads = { c1: { lastReadId: null, mentionCount: 2 }, c2: { lastReadId: null, mentionCount: 5 }, v1: { lastReadId: null, mentionCount: 9 } };
    expect(guildActivity(channels, reads, noSettings, new Set(['g1']), NOW).mentions).toBe(2);
  });

  it('sums a folder of servers', () => {
    const channels = byId(text('c1', 'g1', null), text('c2', 'g2', '9'));
    const reads = { c1: { lastReadId: null, mentionCount: 1 }, c2: { lastReadId: '1', mentionCount: 1 } };
    expect(guildActivity(channels, reads, noSettings, new Set(['g1', 'g2']), NOW)).toEqual({ unread: true, mentions: 2 });
  });

  it('does not light the pip for muted servers but still counts mentions', () => {
    const muted = { guild_id: 'g1', muted: true, mute_config: null, channel_overrides: [] } as unknown as GuildNotificationSettings;
    const channels = byId(text('c1', 'g1', '200'));
    expect(guildActivity(channels, { c1: { lastReadId: '100', mentionCount: 4 } }, () => muted, new Set(['g1']), NOW)).toEqual({ unread: false, mentions: 4 });
  });
});

describe('dmMentionTotal', () => {
  it('sums mentions of conversations only', () => {
    const channels = byId({ id: 'd1', type: ChannelType.DM } as Channel, { id: 'd2', type: ChannelType.GROUP_DM } as Channel, text('c1', 'g1', null));
    const reads = { d1: { lastReadId: null, mentionCount: 1 }, d2: { lastReadId: null, mentionCount: 2 }, c1: { lastReadId: null, mentionCount: 7 } };
    expect(dmMentionTotal(channels, reads)).toBe(3);
  });
});

describe('channelFlags', () => {
  it('reports unread, muted and mentions for a row', () => {
    const channel = text('c1', 'g1', '200');
    expect(channelFlags(channel, { lastReadId: '100', mentionCount: 2 }, undefined, NOW)).toEqual({ unread: true, muted: false, mentions: 2 });
    expect(channelFlags(channel, undefined, undefined, NOW)).toEqual({ unread: true, muted: false, mentions: 0 });
  });

  it('is not unread when muted', () => {
    const muted = { guild_id: 'g1', muted: true, mute_config: null, channel_overrides: [] } as unknown as GuildNotificationSettings;
    expect(channelFlags(text('c1', 'g1', '200'), undefined, muted, NOW)).toMatchObject({ unread: false, muted: true });
  });
});

describe('initialsOf', () => {
  it('uses the first letters of the first and last word, or two letters of a single word', () => {
    expect(initialsOf('Home Base')).toBe('HB');
    expect(initialsOf('Work')).toBe('WO');
    expect(initialsOf('  ')).toBe('?');
  });
});
