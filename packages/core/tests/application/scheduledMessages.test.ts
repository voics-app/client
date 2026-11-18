import { describe, expect, it, vi } from 'vitest';
import { createMemoryStorage } from '../../src/application/ports/deviceStorage';
import { ScheduledMessages } from '../../src/application/scheduledMessages';
import type { ScheduledMessage } from '../../src/contracts/scheduledMessages';

const id = '12345678-1234-4123-8123-123456789abc';
const scheduledAt = () => new Date(Date.now() + 3_600_000).toISOString();
const item = (patch: Partial<ScheduledMessage> = {}): ScheduledMessage => ({ id, channel_id: '10', author_id: '7', revision: 1, status: 'pending', scheduled_at: scheduledAt(), created_at: '2026-11-18T00:00:00Z', updated_at: '2026-11-18T00:00:00Z', message: { content: 'Remember the meeting' }, message_id: null, failure: null, ...patch });

function setup() {
  const storage = createMemoryStorage();
  const api = { createScheduledMessage: vi.fn(), scheduledMessages: vi.fn(), scheduledMessage: vi.fn(), editScheduledMessage: vi.fn(), cancelScheduledMessage: vi.fn() };
  const options = { api, storage, instance: 'https://server.example.invalid', authorId: '7', randomId: vi.fn(() => id) };
  return { api, storage, options, manager: new ScheduledMessages(options) };
}

describe('durable scheduling requests', () => {
  it('persists before POST and retries the original key/body after a restart, even when the current resource is terminal', async () => {
    const { manager, options, api } = setup();
    const message = { content: 'Remember the meeting', tts: true, reply_to: '44', replied_user: false, silent: true };
    const at = scheduledAt();
    const source = { text: '/tts Remember the meeting', replyTo: '44' };
    manager.prepare('10', 'standard', at, message, source);
    api.createScheduledMessage.mockImplementationOnce(async () => {
      expect(manager.pending('10')?.request).toEqual({ request_id: id, scheduled_at: at, message });
      throw new Error('Response lost');
    });
    await expect(manager.confirm('10', 'standard')).rejects.toThrow('Response lost');
    const restarted = new ScheduledMessages(options);
    api.createScheduledMessage.mockResolvedValue(item({ revision: 4, status: 'cancelled', message: null }));
    const accepted = await restarted.confirm('10', 'standard');
    expect(api.createScheduledMessage).toHaveBeenCalledTimes(2);
    expect(api.createScheduledMessage.mock.calls[0]).toEqual(api.createScheduledMessage.mock.calls[1]);
    expect(accepted.item.status).toBe('cancelled');
    expect(accepted.source).toEqual(source);
    expect(restarted.pending('10')).toBeNull();
    expect(options.randomId).toHaveBeenCalledTimes(1);
  });
  it('does not overwrite an uncertain request with an edited draft or share it across accounts/instances', () => {
    const { manager, options } = setup();
    manager.prepare('10', 'standard', scheduledAt(), { content: 'Original' });
    expect(() => manager.prepare('10', 'standard', scheduledAt(), { content: 'Changed' })).toThrow('previous scheduling request');
    expect(manager.pending('10')?.request.message.content).toBe('Original');
    expect(new ScheduledMessages({ ...options, authorId: '8' }).pending('10')).toBeNull();
    expect(new ScheduledMessages({ ...options, instance: 'https://other.example.invalid' }).pending('10')).toBeNull();
  });
  it('fails before networking when durable storage fails or the draft is private', () => {
    const { options, api } = setup();
    const storage = { ...options.storage, setItem: vi.fn(() => { throw new Error('Disk unavailable'); }) };
    const manager = new ScheduledMessages({ ...options, storage });
    expect(() => manager.prepare('10', 'standard', scheduledAt(), { content: 'Draft' })).toThrow('Disk unavailable');
    expect(() => manager.prepare('10', 'ephemeral', scheduledAt(), { content: 'Secret' })).toThrow('Standard');
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(api.createScheduledMessage).not.toHaveBeenCalled();
  });
  it.each([503, 429, 408])('retains the original request for retry after HTTP %s', async (status) => {
    const { manager, api } = setup();
    manager.prepare('10', 'standard', scheduledAt(), { content: 'Draft' });
    const original = manager.pending('10');
    api.createScheduledMessage.mockRejectedValue(Object.assign(new Error('Try later'), { status }));
    await expect(manager.confirm('10', 'standard')).rejects.toThrow();
    expect(manager.pending('10')).toEqual(original);
  });
  it('allows correction after a definitive rejection without automatically submitting another request', async () => {
    const { manager, api } = setup();
    manager.prepare('10', 'standard', scheduledAt(), { content: 'Draft' });
    api.createScheduledMessage.mockRejectedValue(Object.assign(new Error('Time is outside the allowed window'), { status: 400 }));
    await expect(manager.confirm('10', 'standard')).rejects.toThrow();
    expect(manager.pending('10')).toBeNull();
    expect(api.createScheduledMessage).toHaveBeenCalledTimes(1);
  });
  it('uses only exact GET to confirm an old request after the channel becomes private', async () => {
    const { manager, api } = setup();
    manager.prepare('10', 'standard', scheduledAt(), { content: 'An earlier Standard draft' });
    api.scheduledMessage.mockResolvedValue(item({ status: 'failed', revision: 2, message: null, failure: 'delivery_mode_changed' }));
    await manager.confirm('10', 'p2p');
    expect(api.createScheduledMessage).not.toHaveBeenCalled();
    expect(api.scheduledMessage).toHaveBeenCalledWith('10', id);
    expect(manager.pending('10')).toBeNull();
  });
});

describe('scheduled revisions and pagination', () => {
  it('keeps the newest terminal resource when an older page arrives after cancellation', async () => {
    const { manager, api } = setup();
    const cancelled = item({ status: 'cancelled', revision: 3, message: null });
    api.cancelScheduledMessage.mockResolvedValue(cancelled);
    await manager.cancel(item({ revision: 2 }));
    expect(api.cancelScheduledMessage).toHaveBeenCalledWith('10', id, 2);
    api.scheduledMessages.mockResolvedValue({ items: [item()], next_after: null });
    expect((await manager.page('10')).items).toEqual([cancelled]);
    expect(manager.snapshot()[id]?.message).toBeNull();
  });
  it('uses the displayed revision for edits and does not silently retry a conflict', async () => {
    const { manager, api } = setup();
    api.editScheduledMessage.mockRejectedValue(Object.assign(new Error('Changed on another device'), { status: 409 }));
    await expect(manager.edit(item({ revision: 2 }), { message: { content: 'My edit' } })).rejects.toThrow();
    expect(api.editScheduledMessage).toHaveBeenCalledExactlyOnceWith('10', id, { expected_revision: 2, message: { content: 'My edit' } });
  });
  it('preserves an empty page cursor and sends it unchanged to the next request', async () => {
    const { manager, api } = setup();
    api.scheduledMessages.mockResolvedValueOnce({ items: [], next_after: id }).mockResolvedValueOnce({ items: [item()], next_after: null });
    const first = await manager.page('10');
    expect(first.items).toEqual([]);
    const next = await manager.page('10', first.next_after!);
    expect(api.scheduledMessages).toHaveBeenLastCalledWith('10', { after: id, limit: 50 });
    expect(next.items).toHaveLength(1);
  });
  it('rejects records for another author or channel before caching their draft', async () => {
    const { manager, api } = setup();
    api.scheduledMessages.mockResolvedValue({ items: [item({ author_id: '8' })], next_after: null });
    await expect(manager.page('10')).rejects.toThrow('account and channel');
    expect(manager.snapshot()).toEqual({});
  });
});
