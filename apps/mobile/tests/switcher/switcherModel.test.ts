import type { Channel } from '@discordy/core/contracts/rest';
import { rankItems } from '@discordy/core/domain/quickSwitcher';
import { switcherItems } from '../../src/switcher/switcherModel';

const ch = (id: string, type: number, extra: Partial<Channel> = {}): Channel => ({ id, type, name: id, guild_id: 'g1', ...extra }) as Channel;
const channels = Object.fromEntries(
  [
    ch('general', 0, { last_message_id: '9' }),
    ch('lobby', 2),
    ch('cat', 4),
    ch('ideas', 15),
    ch('dm1', 1, { guild_id: null as never, name: null as never, last_message_id: '5' }),
  ].map((c) => [c.id, c]),
);
const input = {
  channels,
  guilds: { g1: { id: 'g1', name: 'Home' } },
  reads: { general: { lastReadId: '3', mentionCount: 0 }, dm1: { lastReadId: '5', mentionCount: 2 } },
  settingsByScope: {},
  recents: ['lobby'],
  dmName: () => 'Ann',
  now: 0,
};

describe('switcherItems', () => {
  const items = switcherItems(input);
  const byId = Object.fromEntries(items.map((i) => [i.id, i]));

  it('lists channels, conversations, servers and screens, but no categories or forums', () => {
    expect(items.map((i) => i.id).filter((id) => id.startsWith('c-')).sort()).toEqual(['c-dm1', 'c-general', 'c-lobby']);
    expect(byId['g-g1']).toMatchObject({ kind: 'guild', label: 'Home', target: { kind: 'guild', guildId: 'g1' } });
    expect(byId['a-friends']).toMatchObject({ kind: 'action', target: { kind: 'route', path: '/friends' } });
  });

  it('points each result at its chat and carries the unread facts', () => {
    expect(byId['c-general']).toMatchObject({ label: '#general', hint: 'Home', unread: true, target: { kind: 'chat', guildId: 'g1', channelId: 'general' }, glyph: null });
    expect(byId['c-dm1']).toMatchObject({ kind: 'dm', label: 'Ann', mentions: 2, target: { kind: 'chat', guildId: null, channelId: 'dm1' } });
    expect(byId['c-lobby']).toMatchObject({ kind: 'voice', glyph: 'volume-high', recent: 0 });
  });

  it('does not count a muted channel as unread', () => {
    const muted = switcherItems({ ...input, settingsByScope: { g1: { channel_overrides: [{ channel_id: 'general', muted: true, mute_config: null }] } as never } });
    expect(muted.find((i) => i.id === 'c-general')?.unread).toBe(false);
  });

  it('ranks with the shared prefixes: mentions first on an empty query, # for text, @ for people', () => {
    expect(rankItems(items, '').items[0]?.id).toBe('c-dm1');
    expect(rankItems(items, '#gen').items.map((i) => i.id)).toEqual(['c-general']);
    expect(rankItems(items, '@an').items.map((i) => i.id)).toEqual(['c-dm1']);
    expect(rankItems(items, '!lob').items.map((i) => i.id)).toEqual(['c-lobby']);
    expect(rankItems(items, '*home').items.map((i) => i.id)).toEqual(['g-g1']);
  });
});
