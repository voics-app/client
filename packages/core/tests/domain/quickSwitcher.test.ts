import { describe, expect, it } from 'vitest';
import { channelSwitcherItem, isSwitchable, matchScore, parseQuery, rankItems, recentChannelIds, type SwitcherItem } from '@discordy/core/domain/quickSwitcher';
import { pickUnreadChannel } from '@discordy/core/domain/unreadNav';

const items: SwitcherItem[] = [
  { id: 'general', kind: 'text', label: '#general', hint: 'Home', guildId: 'g1' },
  { id: 'random', kind: 'text', label: '#random', hint: 'Home', guildId: 'g1', unread: true },
  { id: 'ping', kind: 'text', label: '#pings', hint: 'Home', guildId: 'g1', unread: true, mentions: 2 },
  { id: 'lounge', kind: 'voice', label: 'Lounge', hint: 'Home', guildId: 'g1' },
  { id: 'ann', kind: 'dm', label: 'Ann' },
  { id: 'bob', kind: 'dm', label: 'Bob', recent: 0 },
  { id: 'g1', kind: 'guild', label: 'Home' },
  { id: 'g2', kind: 'guild', label: 'Work' },
  { id: 'g2c', kind: 'text', label: '#plans', hint: 'Work', guildId: 'g2', recent: 1 },
  { id: 'mute', kind: 'action', label: 'Toggle mute' },
];
const ids = (raw: string) => rankItems(items, raw).items.map((i) => i.id);

describe('parseQuery', () => {
  it('reads the prefix as a mode and strips it', () => {
    expect(parseQuery('@ann')).toEqual({ mode: 'people', term: 'ann', channelTerm: null });
    expect(parseQuery('#  gen')).toMatchObject({ mode: 'text', term: 'gen' });
    expect(parseQuery('!lo')).toMatchObject({ mode: 'voice', term: 'lo' });
    expect(parseQuery('plain')).toEqual({ mode: 'all', term: 'plain', channelTerm: null });
  });
  it('splits the server and channel part after a space in server mode', () => {
    expect(parseQuery('*work plans')).toEqual({ mode: 'server', term: 'work', channelTerm: 'plans' });
    expect(parseQuery('*work ')).toEqual({ mode: 'server', term: 'work', channelTerm: '' });
    expect(parseQuery('*work').channelTerm).toBeNull();
  });
});

describe('matchScore', () => {
  it('ranks prefix above substring above subsequence and ignores the # sign', () => {
    expect(matchScore('gen', { label: '#general' })).toBe(100);
    expect(matchScore('ner', { label: '#general' })).toBe(50);
    expect(matchScore('gnl', { label: '#general' })).toBe(10);
    expect(matchScore('zzz', { label: '#general' })).toBe(0);
    expect(matchScore('', { label: 'x' })).toBe(1);
  });
});

describe('rankItems', () => {
  it('lists mentions, then unread, then recent on an empty query, and the rest after', () => {
    const all = ids('');
    expect(all.slice(0, 5)).toEqual(['ping', 'random', 'bob', 'g2c', 'general']);
    expect(all.indexOf('mute')).toBeGreaterThan(all.indexOf('general'));
  });
  it('filters by prefix mode', () => {
    expect(ids('@')).toEqual(['bob', 'ann']);
    expect(ids('#')).toEqual(['ping', 'random', 'g2c', 'general']);
    expect(ids('!')).toEqual(['lounge']);
    expect(ids('*')).toEqual(['g1', 'g2']);
  });
  it('narrows to the channels of a matching server with a space', () => {
    expect(ids('*work ')).toEqual(['g2c']);
    expect(ids('*home ran')).toEqual(['random']);
    expect(ids('*nothing x')).toEqual([]);
  });
  it('orders by match tier first, then by relevance boost', () => {
    // prefix matches (#pings, #plans) outrank the substring match (#random has no p; #general none), mentions break the tie
    expect(ids('#p').slice(0, 2)).toEqual(['ping', 'g2c']);
    expect(ids('o')[0]).not.toBe('mute');
  });
  it('limits the result count', () => {
    expect(rankItems(items, '', 3).items).toHaveLength(3);
  });
});

describe('recentChannelIds', () => {
  it('returns newest first without duplicates or nulls', () => {
    const entries = [{ channelId: 'a' }, { channelId: null }, { channelId: 'b' }, { channelId: 'a' }];
    expect(recentChannelIds(entries)).toEqual(['a', 'b']);
    expect(recentChannelIds(entries, 1)).toEqual(['a']);
  });
});

describe('pickUnreadChannel with mentions first', () => {
  const list = [
    { id: 'a', unread: true, mentions: 0 },
    { id: 'b', unread: true, mentions: 3 },
    { id: 'c', unread: false },
    { id: 'd', unread: true, mentions: 1 },
  ];
  it('walks only mention channels while others have mentions', () => {
    expect(pickUnreadChannel(list, 'a', 1, true)).toBe('b');
    expect(pickUnreadChannel(list, 'b', 1, true)).toBe('d');
    expect(pickUnreadChannel(list, 'd', 1, true)).toBe('b');
  });
  it('falls back to plain unread when no other channel has mentions', () => {
    const only = [{ id: 'a', unread: true }, { id: 'b', unread: true, mentions: 2 }, { id: 'c', unread: true }];
    expect(pickUnreadChannel(only, 'b', 1, true)).toBe('c');
    expect(pickUnreadChannel(only, 'b', 1, false)).toBe('c');
    expect(pickUnreadChannel(only, 'a', 1, false)).toBe('b');
  });
});

describe('channelSwitcherItem', () => {
  const facts = { name: 'general', guildName: 'Home', unread: true, mentions: 2, recent: 1 };
  it('labels a text channel with a hash and carries the server and counts', () => {
    expect(channelSwitcherItem({ id: '5', type: 0, guild_id: 'g1' }, facts)).toEqual({ id: 'c-5', kind: 'text', label: '#general', hint: 'Home', guildId: 'g1', unread: true, mentions: 2, recent: 1 });
  });
  it('keeps a voice channel name bare and a DM without a server', () => {
    expect(channelSwitcherItem({ id: '6', type: 2, guild_id: 'g1' }, { ...facts, name: 'Lounge', recent: -1 })).toMatchObject({ kind: 'voice', label: 'Lounge' });
    const dm = channelSwitcherItem({ id: '7', type: 1 }, { name: 'Ann', guildName: undefined, unread: false, mentions: 0, recent: -1 });
    expect(dm).toEqual({ id: 'c-7', kind: 'dm', label: 'Ann', unread: false, mentions: 0 });
  });
  it('skips categories and forums', () => {
    expect(isSwitchable({ type: 4 })).toBe(false);
    expect(isSwitchable({ type: 15 })).toBe(false);
    expect(isSwitchable({ type: 0 })).toBe(true);
  });
});
