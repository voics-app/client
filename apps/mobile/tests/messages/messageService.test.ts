import { ApiError } from '@discordy/core/infrastructure/http/httpClient';
import { useMessageStore } from '@discordy/core/application/stores/messageStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import type { Channel, Message } from '@discordy/core/contracts/rest';
import { MessageService, PAGE_SIZE } from '../../src/messages/messageService';

const ME = { id: 'me', username: 'me', global_name: 'Me', discriminator: '0', avatar: null };
const channel = { id: 'c1', type: 0, guild_id: 'g1', name: 'general', delivery_mode: 'standard' } as Channel;
const snow = (n: number) => String(1000000 + n);
const msg = (n: number, extra: Partial<Message> = {}) =>
  ({ id: snow(n), channel_id: 'c1', guild_id: 'g1', author: ME, content: `m${n}`, timestamp: '2026-01-01T00:00:00Z', edited_timestamp: null, mention_everyone: false, mentions: [], mention_roles: [], attachments: [], embeds: [], pinned: false, type: 0, ...extra }) as Message;

function makeApi() {
  return {
    messages: jest.fn(async (_c: string, _q?: object): Promise<Message[]> => []),
    sendMessage: jest.fn(async (_c: string, body: { content: string; nonce: string }): Promise<Message> => msg(900, { content: body.content, nonce: body.nonce })),
    editMessage: jest.fn(async (_c: string, id: string, patch: { content?: string }): Promise<Message> => msg(1, { id, ...patch, edited_timestamp: 'now' })),
    deleteMessage: jest.fn(async (_c: string, _id: string): Promise<void> => undefined),
    addReaction: jest.fn(async (_c: string, _id: string, _e: string): Promise<void> => undefined),
    removeReaction: jest.fn(async (_c: string, _id: string, _e: string): Promise<void> => undefined),
  };
}
const timeline = () => useMessageStore.getState().timelines['c1']!;

describe('MessageService', () => {
  beforeEach(() => {
    useMessageStore.getState().reset();
    useSessionStore.getState().reset();
    useSessionStore.setState({ user: ME as never });
  });

  it('loads the latest page and notes when older history is exhausted', async () => {
    const api = makeApi();
    api.messages.mockResolvedValue([msg(2), msg(1)]);
    await new MessageService(api).loadLatest('c1');
    expect(api.messages).toHaveBeenCalledWith('c1', { limit: PAGE_SIZE });
    expect(timeline().ids).toEqual([snow(1), snow(2)]);
    expect(timeline().hasMoreBefore).toBe(false);
  });

  it('keeps hasMoreBefore when a full page came back, and loads older from the oldest message', async () => {
    const api = makeApi();
    api.messages.mockResolvedValueOnce(Array.from({ length: PAGE_SIZE }, (_, i) => msg(100 + i)));
    const service = new MessageService(api);
    await service.loadLatest('c1');
    expect(timeline().hasMoreBefore).toBe(true);
    api.messages.mockResolvedValueOnce([msg(5)]);
    await service.loadOlder('c1');
    expect(api.messages).toHaveBeenLastCalledWith('c1', { before: snow(100), limit: PAGE_SIZE });
    expect(timeline().ids[0]).toBe(snow(5));
    expect(timeline().hasMoreBefore).toBe(false);
  });

  it('does not load older history twice at once or after the start was reached', async () => {
    const api = makeApi();
    api.messages.mockResolvedValueOnce(Array.from({ length: PAGE_SIZE }, (_, i) => msg(100 + i)));
    const service = new MessageService(api);
    await service.loadLatest('c1');
    let release: (m: Message[]) => void = () => undefined;
    api.messages.mockReturnValueOnce(new Promise<Message[]>((r) => (release = r)));
    const first = service.loadOlder('c1');
    await service.loadOlder('c1');
    expect(api.messages).toHaveBeenCalledTimes(2);
    release([]);
    await first;
    await service.loadOlder('c1');
    expect(api.messages).toHaveBeenCalledTimes(2);
  });

  it('sends optimistically and resolves by nonce', async () => {
    const api = makeApi();
    const pending = new MessageService(api).send(channel, { content: 'hello' });
    expect(Object.values(timeline().byId)[0]).toMatchObject({ content: 'hello', localState: 'sending' });
    await pending;
    expect(timeline().ids).toEqual([snow(900)]);
    expect(timeline().byId[snow(900)]?.localState).toBeUndefined();
  });

  it('sends a reply with a message reference', async () => {
    const api = makeApi();
    await new MessageService(api).send(channel, { content: 'yo', replyTo: snow(3) });
    expect(api.sendMessage.mock.calls[0]![1]).toMatchObject({ message_reference: { message_id: snow(3), channel_id: 'c1' } });
  });

  it('marks a failed send with a readable error instead of throwing', async () => {
    const api = makeApi();
    api.sendMessage.mockRejectedValue(new ApiError(0, 0, 'network'));
    await new MessageService(api).send(channel, { content: 'hello' });
    expect(Object.values(timeline().byId)[0]).toMatchObject({ localState: 'failed', error: 'You appear to be offline.' });
  });

  it('retries a failed message and discards another', async () => {
    const api = makeApi();
    api.sendMessage.mockRejectedValueOnce(new ApiError(500, 0, 'boom'));
    const service = new MessageService(api);
    await service.send(channel, { content: 'again' });
    await service.retry(channel, timeline().ids[0]!);
    expect(timeline().ids).toEqual([snow(900)]);
    api.sendMessage.mockRejectedValueOnce(new ApiError(500, 0, 'boom'));
    await service.send(channel, { content: 'x' });
    service.discard('c1', timeline().ids.find((id) => timeline().byId[id]?.localState === 'failed')!);
    expect(timeline().ids).toEqual([snow(900)]);
  });

  it('edits and deletes through the API and the store', async () => {
    const api = makeApi();
    useMessageStore.getState().receive(msg(1));
    const service = new MessageService(api);
    await service.edit('c1', snow(1), 'changed');
    expect(timeline().byId[snow(1)]).toMatchObject({ content: 'changed' });
    await service.remove('c1', snow(1));
    expect(api.deleteMessage).toHaveBeenCalledWith('c1', snow(1));
    expect(timeline().ids).toEqual([]);
  });

  it('toggles a reaction on and off', async () => {
    const api = makeApi();
    useMessageStore.getState().receive(msg(1));
    const service = new MessageService(api);
    await service.toggleReaction('c1', snow(1), '👍');
    expect(api.addReaction).toHaveBeenCalledWith('c1', snow(1), '👍');
    expect(timeline().byId[snow(1)]?.reactions).toEqual([{ emoji: { id: null, name: '👍' }, count: 1, me: true }]);
    await service.toggleReaction('c1', snow(1), '👍');
    expect(api.removeReaction).toHaveBeenCalledWith('c1', snow(1), '👍');
    expect(timeline().byId[snow(1)]?.reactions).toEqual([]);
  });

  it('reverts the reaction and rethrows when the API refuses', async () => {
    const api = makeApi();
    api.addReaction.mockRejectedValue(new ApiError(403, 0, 'Missing Permissions'));
    useMessageStore.getState().receive(msg(1));
    await expect(new MessageService(api).toggleReaction('c1', snow(1), '👍')).rejects.toThrow('Missing Permissions');
    expect(timeline().byId[snow(1)]?.reactions).toEqual([]);
  });
});
