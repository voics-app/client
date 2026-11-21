import { ApiError } from '@discordy/core/infrastructure/http/httpClient';
import { useMessageStore } from '@discordy/core/application/stores/messageStore';
import { useReadStateStore } from '@discordy/core/application/stores/peopleStores';
import { useUploadStore } from '@discordy/core/application/stores/uploadStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import type { Channel, Message } from '@discordy/core/contracts/rest';
import { MessageService, PAGE_SIZE } from '../../src/messages/messageService';

const ME = { id: 'me', username: 'me', global_name: 'Me', discriminator: '0', avatar: null };
const channel = { id: 'c1', type: 0, guild_id: 'g1', name: 'general', delivery_mode: 'standard' } as Channel;
const snow = (n: number) => String(1000000 + n);
const msg = (n: number, extra: Partial<Message> = {}) =>
  ({
    id: snow(n),
    channel_id: 'c1',
    guild_id: 'g1',
    author: ME,
    content: `m${n}`,
    timestamp: '2026-01-01T00:00:00Z',
    edited_timestamp: null,
    mention_everyone: false,
    mentions: [],
    mention_roles: [],
    attachments: [],
    embeds: [],
    pinned: false,
    type: 0,
    ...extra,
  }) as Message;

function makeApi() {
  return {
    messages: jest.fn(async (_c: string, _q?: object): Promise<Message[]> => []),
    ack: jest.fn(async (_c: string, _m: string): Promise<void> => undefined),
    sendMessage: jest.fn(async (_c: string, body: { content: string; nonce: string }): Promise<Message> => msg(900, { content: body.content, nonce: body.nonce })),
    editMessage: jest.fn(async (_c: string, id: string, patch: { content?: string }): Promise<Message> => msg(1, { id, ...patch, edited_timestamp: 'now' })),
    deleteMessage: jest.fn(async (_c: string, _id: string): Promise<void> => undefined),
    addReaction: jest.fn(async (_c: string, _id: string, _e: string): Promise<void> => undefined),
    removeReaction: jest.fn(async (_c: string, _id: string, _e: string): Promise<void> => undefined),
    pin: jest.fn(async (_c: string, _m: string): Promise<void> => undefined),
    unpin: jest.fn(async (_c: string, _m: string): Promise<void> => undefined),
    createAttachmentSlots: jest.fn(async (_c: string, files: { filename: string }[]) => ({ attachments: files.map((f, i) => ({ id: `slot${i}`, upload_url: `https://cdn.test/up/${i}`, upload_filename: `key/${f.filename}` })) })),
    upload: jest.fn(async (_url: string, _file: Blob, onProgress?: (loaded: number, total: number) => void, _signal?: AbortSignal): Promise<void> => onProgress?.(10, 10)),
  };
}
const timeline = () => useMessageStore.getState().timelines['c1']!;

describe('MessageService', () => {
  beforeEach(() => {
    useMessageStore.getState().reset();
    useReadStateStore.getState().reset();
    useSessionStore.getState().reset();
    useSessionStore.setState({ user: ME as never });
  });

  it('acks a channel as read once, moving the read marker and clearing mentions', () => {
    const api = makeApi();
    useReadStateStore.getState().hydrate([{ id: 'c1', last_message_id: snow(1), mention_count: 2 }]);
    const service = new MessageService(api);
    service.markRead('c1', snow(5));
    service.markRead('c1', snow(5));
    expect(api.ack).toHaveBeenCalledTimes(1);
    expect(api.ack).toHaveBeenCalledWith('c1', snow(5));
    expect(useReadStateStore.getState().byChannel['c1']).toEqual({ lastReadId: snow(5), mentionCount: 0 });
  });

  it('does not ack older than what is already read, and ignores an ack failure', async () => {
    const api = makeApi();
    useReadStateStore.getState().hydrate([{ id: 'c1', last_message_id: snow(9), mention_count: 0 }]);
    const service = new MessageService(api);
    service.markRead('c1', snow(5));
    expect(api.ack).not.toHaveBeenCalled();
    api.ack.mockRejectedValueOnce(new Error('offline'));
    expect(() => service.markRead('c1', snow(12))).not.toThrow();
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

  it('loads the window around a message and stays detached from the present until it reaches the latest message', async () => {
    const api = makeApi();
    api.messages.mockResolvedValue([msg(10), msg(11), msg(12)]);
    const service = new MessageService(api);
    await service.loadAround({ ...channel, last_message_id: snow(40) }, snow(11));
    expect(api.messages).toHaveBeenCalledWith('c1', { around: snow(11), limit: PAGE_SIZE });
    expect(timeline().ids).toEqual([snow(10), snow(11), snow(12)]);
    expect(timeline()).toMatchObject({ hasMoreBefore: true, hasMoreAfter: true });
    await service.loadAround({ ...channel, last_message_id: snow(12) }, snow(11));
    expect(timeline().hasMoreAfter).toBe(false);
  });

  it('leaves the timeline alone when nothing comes back around a message', async () => {
    const api = makeApi();
    await new MessageService(api).loadAround(channel, snow(1));
    expect(useMessageStore.getState().timelines['c1']).toBeUndefined();
  });

  it('extends a detached window towards the present from its newest message, one request at a time', async () => {
    const api = makeApi();
    api.messages.mockResolvedValueOnce([msg(10), msg(11)]);
    const service = new MessageService(api);
    await service.loadAround({ ...channel, last_message_id: snow(40) }, snow(10));
    api.messages.mockResolvedValueOnce([msg(12)]);
    await Promise.all([service.loadNewer('c1'), service.loadNewer('c1')]);
    expect(api.messages).toHaveBeenCalledTimes(2);
    expect(api.messages).toHaveBeenLastCalledWith('c1', { after: snow(11), limit: PAGE_SIZE });
    expect(timeline().ids).toEqual([snow(10), snow(11), snow(12)]);
    expect(timeline().hasMoreAfter).toBe(false);
    await service.loadNewer('c1');
    expect(api.messages).toHaveBeenCalledTimes(2);
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
    service.discard(
      'c1',
      timeline().ids.find((id) => timeline().byId[id]?.localState === 'failed')!,
    );
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

  describe('menu actions', () => {
    it('pins a message at once and undoes it when the server refuses', async () => {
      const api = makeApi();
      useMessageStore.getState().receive(msg(1));
      const service = new MessageService(api);
      await service.setPinned('c1', snow(1), true);
      expect(api.pin).toHaveBeenCalledWith('c1', snow(1));
      expect(timeline().byId[snow(1)]?.pinned).toBe(true);
      api.unpin.mockRejectedValueOnce(new ApiError(403, 0, 'Missing Permissions'));
      await expect(service.setPinned('c1', snow(1), false)).rejects.toThrow('Missing Permissions');
      expect(timeline().byId[snow(1)]?.pinned).toBe(true);
    });

    it('marks a message unread by moving the marker to just before it', () => {
      const api = makeApi();
      new MessageService(api).markUnread('c1', snow(5));
      expect(useReadStateStore.getState().byChannel['c1']).toEqual({ lastReadId: snow(4), mentionCount: 0 });
      expect(api.ack).toHaveBeenCalledWith('c1', snow(4), { manual: true, mentionCount: 0 });
    });
  });

  describe('attachments', () => {
    const photo = { uri: 'file:///cache/a.jpg', name: 'a.jpg', size: 10, mimeType: 'image/jpeg' };
    const blob = { size: 10, type: 'image/jpeg' } as Blob;
    const readBlob = jest.fn(async () => blob);

    it('sends voice metadata with the uploaded recording and voice flag', async () => {
      const api = makeApi();
      const service = new MessageService(api, () => 0, readBlob);
      await service.send(channel, { content: '', files: [photo], voice: { duration_secs: 2.5, waveform: 'AQID' } });
      expect(api.sendMessage).toHaveBeenCalledWith('c1', expect.objectContaining({
        flags: 8192,
        attachments: [expect.objectContaining({ duration_secs: 2.5, waveform: 'AQID' })],
      }));
    });

    it('uploads through slots, then sends the message with the attachment list', async () => {
      const api = makeApi();
      const service = new MessageService(api, () => 0, readBlob);
      await service.send(channel, { content: 'look', files: [photo] });
      expect(api.createAttachmentSlots).toHaveBeenCalledWith('c1', [{ filename: 'a.jpg', file_size: 10 }]);
      expect(api.upload).toHaveBeenCalledWith('https://cdn.test/up/0', blob, expect.any(Function), expect.any(AbortSignal));
      expect(api.sendMessage).toHaveBeenCalledWith('c1', expect.objectContaining({ content: 'look', attachments: [{ id: 'slot0', filename: 'a.jpg', uploaded_filename: 'key/a.jpg' }] }));
      expect(useUploadStore.getState().uploads).toEqual({});
    });

    it('shows the local file in the unsent message with upload progress, and keeps the files for Retry', async () => {
      const api = makeApi();
      api.upload.mockRejectedValueOnce(new Error('offline'));
      const service = new MessageService(api, () => 0, readBlob);
      await service.send(channel, { content: '', files: [photo] });
      const failed = Object.values(timeline().byId).find((m) => m.localState === 'failed')!;
      expect(failed.attachments[0]).toMatchObject({ filename: 'a.jpg', url: photo.uri, content_type: 'image/jpeg' });
      expect(api.sendMessage).not.toHaveBeenCalled();
      await service.retry(channel, failed.id);
      expect(api.createAttachmentSlots).toHaveBeenCalledTimes(2);
      expect(api.sendMessage).toHaveBeenCalledWith('c1', expect.objectContaining({ attachments: expect.any(Array) }));
    });

    it('removes the message when the upload is cancelled', async () => {
      const api = makeApi();
      api.upload.mockImplementationOnce(async (_u, _f, _p, signal) => {
        useUploadStore.getState().uploads[Object.keys(useUploadStore.getState().uploads)[0]!]!.abort();
        if (signal?.aborted) throw new Error('aborted');
      });
      await new MessageService(api, () => 0, readBlob).send(channel, { content: 'x', files: [photo] });
      expect(Object.values(timeline().byId).filter((m) => m.localState)).toEqual([]);
      expect(api.sendMessage).not.toHaveBeenCalled();
    });
  });
});
