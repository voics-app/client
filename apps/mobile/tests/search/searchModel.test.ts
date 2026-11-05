import { SearchService, type SearchTarget } from '@discordy/core/application/searchService';
import type { Attachment, Channel, Message } from '@discordy/core/contracts/rest';
import { runSearch } from '../../src/search/searchRunner';
import { fileRows, hitsOf, linkRows, linksIn, mediaTiles, tabQueries } from '../../src/search/searchTabs';

const att = (id: string, filename: string, content_type: string): Attachment => ({ id, filename, content_type, size: 2048, url: `https://cdn.test/${filename}` }) as Attachment;
const msg = (id: string, extra: Partial<Message> = {}) =>
  ({ id, channel_id: 'c1', guild_id: 'g1', author: { id: 'u2', username: 'pat', global_name: 'Pat', avatar: null }, content: `m${id}`, timestamp: '2026-01-01T00:00:00Z', attachments: [], embeds: [], mentions: [], mention_roles: [], pinned: false, type: 0, ...extra }) as unknown as Message;
const hit = (m: Message) => [{ ...m, hit: true }];

describe('tabQueries', () => {
  it('adds the has filter of the tab to what was typed', () => {
    expect(tabQueries('messages', ' deploy ')).toEqual(['deploy']);
    expect(tabQueries('media', 'trip')).toEqual(['trip has:image', 'trip has:video']);
    expect(tabQueries('files', 'report from:pat')).toEqual(['report from:pat has:file']);
    expect(tabQueries('links', 'docs')).toEqual(['docs has:link']);
  });

  it('works with nothing typed but a filter', () => {
    expect(tabQueries('links', 'from:pat')).toEqual(['from:pat has:link']);
    expect(tabQueries('media', '')).toEqual(['has:image', 'has:video']);
  });
});

describe('tab results', () => {
  const photo = msg('3', { attachments: [att('a1', 'cat.png', 'image/png'), att('a2', 'dog.png', 'image/png'), att('a3', 'notes.pdf', 'application/pdf')] });
  const clip = msg('2', { attachments: [att('a4', 'clip.mp4', 'video/mp4'), att('a5', 'song.mp3', 'audio/mpeg')] });

  it('takes the matching message of each group', () => {
    expect(hitsOf([[msg('1'), ...hit(msg('2'))], [msg('9')]]).map((m) => m.id)).toEqual(['2', '9']);
  });

  it('lists images and videos as media and everything else as files', () => {
    const hits = [photo, clip];
    expect(mediaTiles(hits).map((t) => [t.attachment.filename, t.video])).toEqual([['cat.png', false], ['dog.png', false], ['clip.mp4', true]]);
    expect(fileRows(hits).map((r) => r.name)).toEqual(['notes.pdf', 'song.mp3']);
  });

  it('finds the links in the text without trailing punctuation or repeats', () => {
    expect(linksIn('see https://a.test/x, and (https://b.test/y). https://a.test/x again')).toEqual(['https://a.test/x', 'https://b.test/y']);
    expect(linksIn('no links here')).toEqual([]);
    const rows = linkRows([msg('5', { content: 'read https://docs.test/start now' })]);
    expect(rows).toMatchObject([{ url: 'https://docs.test/start', host: 'docs.test' }]);
  });
});

describe('runSearch', () => {
  const channel = { id: 'c1', type: 0, guild_id: 'g1', name: 'general', delivery_mode: 'standard' } as Channel;
  const target: SearchTarget = { channel, guildName: 'Home', mode: 'standard', candidates: { users: [{ id: 'u2', name: 'pat' }], channels: [{ id: 'c1', name: 'general' }] } };
  const serve = (byHas: Record<string, { total: number; messages: Message[][] }>) =>
    jest.fn(async (_scope: unknown, params: { has?: string[] }) => {
      const found = byHas[params.has?.[0] ?? ''] ?? { total: 0, messages: [] };
      return { total_results: found.total, messages: found.messages };
    });

  it('merges the image and video searches of the Media tab, newest first, each hit once', async () => {
    const searchMessages = serve({ image: { total: 30, messages: [hit(msg('10')), hit(msg('30'))] }, video: { total: 5, messages: [hit(msg('20')), hit(msg('30'))] } });
    const result = await runSearch(new SearchService({ api: { searchMessages } as never, localMessages: async () => [] }), target, 'media', 'trip', 0);
    expect(result).toMatchObject({ kind: 'ready', total: 35, hasMore: true });
    if (result.kind !== 'ready') return;
    expect(hitsOf(result.groups).map((m) => m.id)).toEqual(['30', '20', '10']);
    expect(searchMessages).toHaveBeenCalledTimes(2);
  });

  it('pages on with an offset and stops when every query is exhausted', async () => {
    const searchMessages = serve({ '': { total: 26, messages: [hit(msg('1'))] } });
    const service = new SearchService({ api: { searchMessages } as never, localMessages: async () => [] });
    expect(await runSearch(service, target, 'messages', 'hello', 0)).toMatchObject({ hasMore: true });
    expect(await runSearch(service, target, 'messages', 'hello', 25)).toMatchObject({ hasMore: false });
    expect(searchMessages).toHaveBeenLastCalledWith({ guildId: 'g1', channelId: 'c1' }, expect.objectContaining({ offset: 25 }));
  });

  it('asks for nothing when the query is empty, and reports unknown names and server failures as errors', async () => {
    const searchMessages = jest.fn().mockRejectedValueOnce(Object.assign(new Error('x'), { status: 503 }));
    const service = new SearchService({ api: { searchMessages } as never, localMessages: async () => [] });
    expect(await runSearch(service, target, 'messages', '  ', 0)).toEqual({ kind: 'empty' });
    expect(await runSearch(service, target, 'messages', 'from:ghost', 0)).toEqual({ kind: 'error', message: 'No member named "ghost"' });
    expect(await runSearch(service, target, 'messages', 'hello', 0)).toEqual({ kind: 'error', message: 'Search is unavailable right now.' });
  });

  it('can sort oldest first', async () => {
    const searchMessages = serve({ '': { total: 2, messages: [hit(msg('2')), hit(msg('1'))] } });
    const result = await runSearch(new SearchService({ api: { searchMessages } as never, localMessages: async () => [] }), target, 'messages', 'hello', 0, 'oldest');
    expect(result.kind === 'ready' && hitsOf(result.groups).map((m) => m.id)).toEqual(['1', '2']);
  });
});
