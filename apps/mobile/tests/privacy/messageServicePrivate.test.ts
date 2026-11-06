import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useMessageStore } from '@discordy/core/application/stores/messageStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import type { Channel, Message } from '@discordy/core/contracts/rest';
import { messageCache } from '../../src/offline/messageCache';
import { MessageService, type PrivateChat } from '../../src/messages/messageService';

const ME = { id: 'me', username: 'me', global_name: 'Me', discriminator: '0', avatar: null };
const ephemeral = { id: 'c1', type: 1, name: 'dm', delivery_mode: 'ephemeral' } as Channel;
const standard = { id: 'c2', type: 0, guild_id: 'g1', name: 'general', delivery_mode: 'standard' } as Channel;
const stored = (id: string, channelId: string): Message =>
  ({ id, channel_id: channelId, author: ME, content: 'x', timestamp: '2026-01-01T00:00:00Z', edited_timestamp: null, mention_everyone: false, mentions: [], mention_roles: [], attachments: [], embeds: [], pinned: false, type: 0 }) as Message;

function setup() {
  const api = {
    messages: jest.fn(async (): Promise<Message[]> => []),
    ack: jest.fn(async () => undefined),
    sendMessage: jest.fn(async (_c: string, body: { content: string; nonce: string }) => ({ ...stored('900', 'c2'), content: body.content, nonce: body.nonce })),
    editMessage: jest.fn(),
    deleteMessage: jest.fn(),
    addReaction: jest.fn(),
    removeReaction: jest.fn(),
    createAttachmentSlots: jest.fn(),
    upload: jest.fn(),
    pin: jest.fn(),
    unpin: jest.fn(),
  };
  const privateChat = {
    resolveMode: jest.fn((channel: Channel) => channel.delivery_mode ?? 'standard'),
    loadHistory: jest.fn(async (_channel: Channel, _before?: string): Promise<void> => undefined),
    send: jest.fn(async (_channel: Channel, _input: { content: string; replyTo?: string | null }): Promise<unknown> => undefined),
    remove: jest.fn(async (_channel: Channel, _messageId: string): Promise<void> => undefined),
  };
  return { api, privateChat, service: new MessageService(api as never, Date.now, undefined, messageCache, privateChat as PrivateChat) };
}
const timeline = (id: string) => useMessageStore.getState().timelines[id]!;

describe('MessageService with private chats', () => {
  beforeEach(() => {
    useMessageStore.getState().reset();
    useGuildStore.getState().reset();
    useSessionStore.getState().reset();
    messageCache.clear();
    useSessionStore.setState({ user: ME as never });
    useGuildStore.getState().upsertChannel(ephemeral);
    useGuildStore.getState().upsertChannel(standard);
  });

  it('loads an ephemeral chat from the local store and leaves the server out of it', async () => {
    const { api, privateChat, service } = setup();
    await service.loadLatest('c1');
    expect(privateChat.loadHistory).toHaveBeenCalledWith(ephemeral);
    expect(api.messages).not.toHaveBeenCalled();
  });

  it('pages older private messages from the local store, starting at the oldest shown', async () => {
    const { api, privateChat, service } = setup();
    useMessageStore.getState().setHistory('c1', [stored('1000005', 'c1')], { prepend: false, hasMoreBefore: true });
    await service.loadOlder('c1');
    expect(privateChat.loadHistory).toHaveBeenCalledWith(ephemeral, '1000005');
    expect(api.messages).not.toHaveBeenCalled();
  });

  it('still uses the server for a standard chat', async () => {
    const { api, privateChat, service } = setup();
    await service.loadLatest('c2');
    expect(api.messages).toHaveBeenCalledWith('c2', { limit: 50 });
    expect(privateChat.loadHistory).not.toHaveBeenCalled();
  });

  it('never saves private messages to the plain message cache', async () => {
    const { service } = setup();
    useMessageStore.getState().setHistory('c1', [stored('1000001', 'c1')], { prepend: false, hasMoreBefore: false });
    service.saveRecent('c1');
    expect(messageCache.load('c1')).toEqual([]);
    useMessageStore.getState().setHistory('c2', [stored('1000002', 'c2')], { prepend: false, hasMoreBefore: false });
    service.saveRecent('c2');
    expect(messageCache.load('c2')).toHaveLength(1);
  });

  it('sends through the private sender and drops the pending copy when the real message arrives', async () => {
    const { api, privateChat, service } = setup();
    privateChat.send.mockImplementationOnce(async () => {
      useMessageStore.getState().receive({ ...stored('2000000', 'c1'), content: 'hi' });
    });
    expect(await service.send(ephemeral, { content: 'hi', replyTo: '1000001' })).toBe(true);
    expect(privateChat.send).toHaveBeenCalledWith(ephemeral, { content: 'hi', replyTo: '1000001' });
    expect(api.sendMessage).not.toHaveBeenCalled();
    expect(timeline('c1').ids).toEqual(['2000000']);
  });

  it('keeps a failed private message with the reason, and Retry sends it again privately', async () => {
    const { api, privateChat, service } = setup();
    privateChat.send.mockRejectedValueOnce(new Error('Peer offline.'));
    expect(await service.send(ephemeral, { content: 'hello' })).toBe(false);
    const [failedId] = timeline('c1').ids;
    expect(timeline('c1').byId[failedId!]).toMatchObject({ localState: 'failed', content: 'hello', deliveryMode: 'ephemeral' });
    expect(await service.retry(ephemeral, failedId!)).toBe(true);
    expect(privateChat.send).toHaveBeenCalledTimes(2);
    expect(api.sendMessage).not.toHaveBeenCalled();
    expect(timeline('c1').ids).toEqual([]);
  });

  it('deletes in a private chat for everyone and never asks the server', async () => {
    const { api, privateChat, service } = setup();
    await service.remove('c1', '2000000');
    expect(privateChat.remove).toHaveBeenCalledWith(ephemeral, '2000000');
    expect(api.deleteMessage).not.toHaveBeenCalled();
  });

  it('still deletes a standard message on the server', async () => {
    const { api, privateChat, service } = setup();
    useMessageStore.getState().setHistory('c2', [stored('1000002', 'c2')], { prepend: false, hasMoreBefore: false });
    await service.remove('c2', '1000002');
    expect(api.deleteMessage).toHaveBeenCalledWith('c2', '1000002');
    expect(privateChat.remove).not.toHaveBeenCalled();
    expect(timeline('c2').ids).toEqual([]);
  });

  it('sends a standard message to the server as before', async () => {
    const { api, privateChat, service } = setup();
    expect(await service.send(standard, { content: 'plain' })).toBe(true);
    expect(api.sendMessage).toHaveBeenCalled();
    expect(privateChat.send).not.toHaveBeenCalled();
  });

  it('treats every chat as standard when there is no private engine (Expo Go)', async () => {
    const api = setup().api;
    const service = new MessageService(api as never);
    await service.loadLatest('c1');
    expect(api.messages).toHaveBeenCalledWith('c1', { limit: 50 });
  });
});
