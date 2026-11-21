// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createMemoryStorage } from '@discordy/core/application/ports/deviceStorage';
import { ScheduledMessages } from '@discordy/core/application/scheduledMessages';
import type { ScheduledMessage } from '@discordy/core/contracts/scheduledMessages';
import { useScheduledMessages } from '@discordy/react/useScheduledMessages';

const one = '12345678-1234-4123-8123-123456789ab1';
const two = '12345678-1234-4123-8123-123456789ab2';
const three = '12345678-1234-4123-8123-123456789ab3';
const resource = (id: string, patch: Partial<ScheduledMessage> = {}): ScheduledMessage => ({ id, channel_id: '10', author_id: '7', revision: 1, status: 'pending', scheduled_at: '2026-11-18T12:00:00Z', created_at: '2026-11-18T10:00:00Z', updated_at: '2026-11-18T10:00:00Z', message: { content: id }, message_id: null, failure: null, ...patch });

beforeEach(() => vi.useFakeTimers());
afterEach(() => { cleanup(); vi.useRealTimers(); });

it.each([null, two])('retains loaded later pages during polling and continues from the loaded cursor %s', async (next) => {
  let first = resource(one);
  let second = resource(two);
  const api = {
    scheduledMessages: vi.fn(async (_channel: string, query: { after?: string }) => query.after === one
      ? { items: [second], next_after: next }
      : query.after === two ? { items: [resource(three)], next_after: null } : { items: [first], next_after: one }),
    createScheduledMessage: vi.fn(), scheduledMessage: vi.fn(), editScheduledMessage: vi.fn(), cancelScheduledMessage: vi.fn(),
  };
  const manager = new ScheduledMessages({ api, storage: createMemoryStorage(), instance: 'https://api.test', authorId: '7', randomId: () => one });
  const view = renderHook(() => useScheduledMessages(manager, '10', true));
  await act(async () => undefined);
  expect(view.result.current.items.map((item) => item.id)).toEqual([one]);
  await act(async () => view.result.current.loadMore());
  expect(view.result.current.items.map((item) => item.id)).toEqual([one, two]);
  expect(view.result.current.next).toBe(next);

  first = resource(one, { revision: 2, message: { content: 'Refreshed first page' } });
  second = resource(two, { revision: 2, message: { content: 'Refreshed second page' } });
  await act(async () => vi.advanceTimersByTimeAsync(15_000));
  expect(view.result.current.items.map((item) => item.id)).toEqual([one, two]);
  expect(view.result.current.items[0]?.message?.content).toBe('Refreshed first page');
  expect(view.result.current.items[1]?.status).toBe('pending');
  expect(view.result.current.items[1]?.message?.content).toBe('Refreshed second page');
  expect(view.result.current.next).toBe(next);

  // A stale later page must also not restore draft text after a successful cancellation.
  api.cancelScheduledMessage.mockResolvedValue(resource(two, { status: 'cancelled', revision: 3, message: null }));
  await act(async () => { await manager.cancel(view.result.current.items.find((item) => item.id === two)!); });
  expect(api.cancelScheduledMessage).toHaveBeenCalledWith('10', two, 2);
  await act(async () => vi.advanceTimersByTimeAsync(15_000));
  expect(view.result.current.items.find((item) => item.id === two)).toMatchObject({ status: 'cancelled', revision: 3, message: null });
  expect(view.result.current.next).toBe(next);
  if (next) {
    await act(async () => view.result.current.loadMore());
    expect(api.scheduledMessages).toHaveBeenLastCalledWith('10', { after: two, limit: 50 });
    expect(new Set(view.result.current.items.map((item) => item.id))).toEqual(new Set([one, two, three]));
    expect(view.result.current.next).toBeNull();
  }
});
