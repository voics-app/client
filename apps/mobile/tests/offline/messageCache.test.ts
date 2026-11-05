import { createMemoryStorage } from '@discordy/core/application/ports/deviceStorage';
import { useMessageStore, type ChatMessage } from '@discordy/core/application/stores/messageStore';
import { CACHED_CHANNELS, CACHED_MESSAGES_PER_CHANNEL, MessageCache, recentMessages, trimChannels } from '../../src/offline/messageCache';
import { MessageService } from '../../src/messages/messageService';

const message = (n: number, extra: Partial<ChatMessage> = {}): ChatMessage =>
  ({ id: String(1000 + n), channel_id: 'c1', author: { id: 'u2', username: 'pat' }, content: `message ${n}`, timestamp: new Date(n * 1000).toISOString(), edited_timestamp: null, mention_everyone: false, mentions: [], mention_roles: [], attachments: [], embeds: [], pinned: false, type: 0, ...extra }) as ChatMessage;

describe('recentMessages', () => {
  it('keeps the newest 50, oldest first, and never an unsent or failed message', () => {
    const many = Array.from({ length: 70 }, (_, i) => message(i)).reverse();
    const kept = recentMessages([...many, message(900, { localState: 'sending' }), message(901, { localState: 'failed' })]);
    expect(kept).toHaveLength(CACHED_MESSAGES_PER_CHANNEL);
    expect(kept[0]!.id).toBe('1020');
    expect(kept.at(-1)!.id).toBe('1069');
  });
});

describe('trimChannels', () => {
  it('drops the least recently saved chats beyond the limit', () => {
    const cache = Object.fromEntries(Array.from({ length: CACHED_CHANNELS + 2 }, (_, i) => [`c${i}`, { savedAt: i, messages: [] }]));
    const kept = Object.keys(trimChannels(cache));
    expect(kept).toHaveLength(CACHED_CHANNELS);
    expect(kept).not.toContain('c0');
    expect(kept).not.toContain('c1');
  });
});

describe('MessageCache', () => {
  it('saves and loads a chat, replacing what was saved before, and keeps chats apart', () => {
    const cache = new MessageCache(createMemoryStorage());
    cache.save('c1', [message(1), message(2)]);
    cache.save('c2', [message(3)]);
    expect(cache.load('c1').map((m) => m.content)).toEqual(['message 1', 'message 2']);
    cache.save('c1', [message(4)]);
    expect(cache.load('c1').map((m) => m.content)).toEqual(['message 4']);
    expect(cache.load('c2')).toHaveLength(1);
    expect(cache.load('nope')).toEqual([]);
  });

  it('saves nothing for a chat with no sent messages, and survives garbage in storage', () => {
    const storage = createMemoryStorage();
    const cache = new MessageCache(storage);
    cache.save('c1', [message(1, { localState: 'sending' })]);
    expect(storage.getItem('voics.messageCache.v1')).toBeNull();
    storage.setItem('voics.messageCache.v1', '{not json');
    expect(cache.load('c1')).toEqual([]);
    cache.save('c1', [message(1)]);
    expect(cache.load('c1')).toHaveLength(1);
  });

  it('empties everything on clear', () => {
    const cache = new MessageCache(createMemoryStorage());
    cache.save('c1', [message(1)]);
    cache.clear();
    expect(cache.load('c1')).toEqual([]);
  });

  it('does not throw when the storage does', () => {
    const broken = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); }, removeItem: () => { throw new Error('x'); } };
    const cache = new MessageCache(broken);
    expect(() => cache.save('c1', [message(1)])).not.toThrow();
    expect(cache.load('c1')).toEqual([]);
    expect(() => cache.clear()).not.toThrow();
  });
});

describe('opening a chat with the cache', () => {
  beforeEach(() => useMessageStore.getState().reset());
  const service = (messages: jest.Mock, cache: MessageCache) => new MessageService({ messages } as never, Date.now, undefined, cache);

  it('shows the saved messages at once, then the fresh page, and saves it', async () => {
    const cache = new MessageCache(createMemoryStorage());
    cache.save('c1', [message(1)]);
    let release: (page: ChatMessage[]) => void = () => undefined;
    const messages = jest.fn(() => new Promise<ChatMessage[]>((resolve) => (release = resolve)));
    const pending = service(messages, cache).loadLatest('c1');
    expect(useMessageStore.getState().timelines['c1']?.ids).toEqual(['1001']);
    release([message(2), message(3)]);
    await pending;
    expect(useMessageStore.getState().timelines['c1']?.ids).toEqual(['1002', '1003']);
    expect(cache.load('c1').map((m) => m.id)).toEqual(['1002', '1003']);
  });

  it('keeps the saved messages and says so when the server cannot be reached', async () => {
    const cache = new MessageCache(createMemoryStorage());
    cache.save('c1', [message(1)]);
    await expect(service(jest.fn().mockRejectedValue(new Error('Network request failed')), cache).loadLatest('c1')).rejects.toThrow('Showing the messages saved on this phone.');
    expect(useMessageStore.getState().timelines['c1']?.ids).toEqual(['1001']);
  });

  it('fails plainly when nothing was saved', async () => {
    const cache = new MessageCache(createMemoryStorage());
    await expect(service(jest.fn().mockRejectedValue(new Error('Network request failed')), cache).loadLatest('c1')).rejects.toThrow('Network request failed');
    expect(useMessageStore.getState().timelines['c1']?.loaded).not.toBe(true);
  });

  it('saves the newest messages when the chat is left', () => {
    const cache = new MessageCache(createMemoryStorage());
    useMessageStore.getState().setHistory('c1', [message(5), message(6)], { prepend: false, hasMoreBefore: false });
    service(jest.fn(), cache).saveRecent('c1');
    expect(cache.load('c1').map((m) => m.id)).toEqual(['1005', '1006']);
  });
});
