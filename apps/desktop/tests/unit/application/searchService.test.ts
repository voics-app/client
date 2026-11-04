import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Channel, Message, MessageSearchResponse } from '@discordy/core/contracts/rest';
import { SearchService, type SearchTarget } from '@renderer/application/search/searchService';
import { useSearchStore } from '@discordy/core/application/stores/searchStore';

function msg(id: string, content: string, hit = false): Message {
  return {
    id,
    channel_id: 'c1',
    author: { id: '10', username: 'alice', global_name: null, avatar: null },
    content,
    timestamp: new Date(2026, 9, 21, 12, Number(id.replace(/\D/g, '')) % 60).toISOString(),
    edited_timestamp: null,
    mention_everyone: false,
    mentions: [],
    mention_roles: [],
    attachments: [],
    embeds: [],
    pinned: false,
    type: 0,
    ...(hit ? { hit: true } : {}),
  };
}

const guildChannel = { id: 'c1', type: 0, name: 'general', guild_id: 'g1' } as Channel;
const dm = { id: 'd1', type: 1, name: null } as unknown as Channel;
const candidates = { users: [{ id: '10', name: 'alice' }], channels: [{ id: 'c1', name: 'general' }] };

function target(channel: Channel, mode: SearchTarget['mode'] = 'standard'): SearchTarget {
  return { channel, guildName: channel.guild_id ? 'Guild' : null, mode, candidates };
}

describe('SearchService', () => {
  beforeEach(() => useSearchStore.getState().reset());

  it('searches a server through the guild endpoint with resolved filters and shows the result', async () => {
    const searchMessages = vi.fn<(scope: unknown, params: unknown) => Promise<MessageSearchResponse>>().mockResolvedValue({
      total_results: 1,
      messages: [[msg('1', 'before'), msg('2', 'the deploy', true)]],
      index_building: true,
    });
    const service = new SearchService({ api: { searchMessages }, localMessages: vi.fn() });
    await service.run(target(guildChannel), 'deploy from:alice has:link');
    expect(searchMessages).toHaveBeenCalledWith(
      { guildId: 'g1', channelId: 'c1' },
      expect.objectContaining({ content: 'deploy', author_id: ['10'], has: ['link'], sort_by: 'timestamp', sort_order: 'desc', offset: 0, limit: 25 }),
    );
    const s = useSearchStore.getState();
    expect(s).toMatchObject({ status: 'ready', total: 1, indexBuilding: true, local: false, terms: ['deploy'], scopeLabel: 'Guild' });
    expect(s.groups[0]).toHaveLength(2);
  });

  it('uses the channel endpoint in direct messages and drops the in: filter', async () => {
    const searchMessages = vi.fn().mockResolvedValue({ total_results: 0, messages: [] });
    const service = new SearchService({ api: { searchMessages }, localMessages: vi.fn() });
    await service.run(target(dm), 'hello in:general');
    expect(searchMessages.mock.calls[0]![0]).toEqual({ guildId: null, channelId: 'd1' });
    expect(searchMessages.mock.calls[0]![1].channel_id).toBeUndefined();
    expect(useSearchStore.getState().status).toBe('ready');
  });

  it('refuses unknown names without calling the server', async () => {
    const searchMessages = vi.fn();
    const service = new SearchService({ api: { searchMessages }, localMessages: vi.fn() });
    await service.run(target(guildChannel), 'from:ghost');
    expect(searchMessages).not.toHaveBeenCalled();
    expect(useSearchStore.getState()).toMatchObject({ status: 'error', error: 'No member named "ghost"' });
  });

  it('turns rate limits and outages into readable errors', async () => {
    const searchMessages = vi.fn().mockRejectedValueOnce(Object.assign(new Error('x'), { status: 429 })).mockRejectedValueOnce(Object.assign(new Error('x'), { status: 503 }));
    const service = new SearchService({ api: { searchMessages }, localMessages: vi.fn() });
    await service.run(target(guildChannel), 'hello');
    expect(useSearchStore.getState().error).toMatch(/too fast/);
    await service.run(target(guildChannel), 'hello');
    expect(useSearchStore.getState().error).toMatch(/unavailable/);
  });

  it('does nothing for an empty query', async () => {
    const searchMessages = vi.fn();
    const service = new SearchService({ api: { searchMessages }, localMessages: vi.fn() });
    await service.run(target(guildChannel), '   ');
    expect(searchMessages).not.toHaveBeenCalled();
    expect(useSearchStore.getState().status).toBe('idle');
  });

  it('searches the local store for Ephemeral and P2P chats, never the server', async () => {
    const searchMessages = vi.fn();
    const all = [msg('a1', 'first'), msg('a2', 'secret plan'), msg('a3', 'last')];
    const service = new SearchService({ api: { searchMessages }, localMessages: async () => all });
    await service.run(target(dm, 'ephemeral'), 'secret');
    expect(searchMessages).not.toHaveBeenCalled();
    const s = useSearchStore.getState();
    expect(s).toMatchObject({ status: 'ready', local: true, total: 1 });
    expect(s.groups[0]!.map((m) => [m.content, m.hit === true])).toEqual([['first', false], ['secret plan', true], ['last', false]]);
  });

  it('ignores a slow response that a newer search has replaced', async () => {
    let release: (r: MessageSearchResponse) => void = () => undefined;
    const slow = new Promise<MessageSearchResponse>((resolve) => (release = resolve));
    const searchMessages = vi.fn().mockReturnValueOnce(slow).mockResolvedValueOnce({ total_results: 1, messages: [[msg('9', 'new', true)]] });
    const service = new SearchService({ api: { searchMessages }, localMessages: vi.fn() });
    const first = service.run(target(guildChannel), 'old');
    await service.run(target(guildChannel), 'new');
    release({ total_results: 5, messages: [] });
    await first;
    expect(useSearchStore.getState()).toMatchObject({ total: 1, submitted: 'new' });
  });
});
