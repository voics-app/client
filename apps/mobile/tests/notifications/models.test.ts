import type { ChatMessage } from '@discordy/core/application/stores/messageStore';
import type { InboxEntry } from '@discordy/core/domain/mentionInbox';
import { bannerOf, channelIdFromPath } from '../../src/notifications/bannerModel';
import { inboxSections } from '../../src/notifications/inboxModel';

const entry = (id: string, guildId: string, channelId: string): InboxEntry => ({ id, guildId, channelId, authorId: 'u2', authorName: 'Pat', preview: `hello ${id}`, timestamp: '2026-01-01T00:00:00Z' });

describe('inboxSections', () => {
  const guilds = { g1: { name: 'Home' }, g2: { name: 'Club' } };
  const channels = { general: { name: 'general' }, chat: { name: 'chat' } };

  it('groups by server in the order given and names the channel', () => {
    const sections = inboxSections([entry('9', 'g1', 'general'), entry('8', 'g2', 'chat'), entry('7', 'g1', 'general')], guilds, channels, Date.parse('2026-01-01T01:00:00Z'));
    expect(sections.map((s) => [s.title, s.data.map((r) => r.id)])).toEqual([
      ['Home', ['9', '7']],
      ['Club', ['8']],
    ]);
    expect(sections[0]!.data[0]).toMatchObject({ author: 'Pat', channelName: 'general', preview: 'hello 9', guildId: 'g1', channelId: 'general' });
  });

  it('drops entries of servers or channels the viewer no longer has', () => {
    expect(inboxSections([entry('1', 'gone', 'general'), entry('2', 'g1', 'deleted')], guilds, channels, 0)).toEqual([]);
  });
});

describe('channelIdFromPath', () => {
  it.each([
    ['/servers/g1/general', 'general'],
    ['/servers/g1/general/', 'general'],
    ['/dms/55', '55'],
    ['/servers/g1/members', null],
    ['/servers/g1/settings', null],
    ['/servers/g1', null],
    ['/dms', null],
    ['/notifications', null],
    ['/', null],
  ])('%s is %s', (path, expected) => expect(channelIdFromPath(path)).toBe(expected));
});

describe('bannerOf', () => {
  const message = (extra: object = {}) =>
    ({ id: '5', channel_id: 'general', guild_id: 'g1', author: { id: 'u2', username: 'pat', global_name: 'Pat' }, content: '**hi** @me', ...extra }) as unknown as ChatMessage;

  it('names the author and the channel for a server message', () => {
    expect(bannerOf(message(), { name: 'general' })).toEqual({ id: '5', guildId: 'g1', channelId: 'general', title: 'Pat in #general', body: 'hi @me' });
  });

  it('uses the author alone for a direct message and the group name for a group', () => {
    expect(bannerOf(message({ guild_id: null }), { name: null } as never).title).toBe('Pat');
    expect(bannerOf(message({ guild_id: null }), { name: 'Chess club' }).title).toBe('Pat in Chess club');
  });

  it('hides the text of private messages', () => {
    expect(bannerOf(message({ deliveryMode: 'p2p' }), undefined).body).toBe('Sent a private message');
  });
});
