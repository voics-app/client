// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ForumView } from '@renderer/interface/features/chat/ForumView';

const fixture = vi.hoisted(() => ({
  createThread: vi.fn(), send: vi.fn(), upsertChannel: vi.fn(), setSidePanel: vi.fn(),
  channels: { forum: { id: 'forum', name: 'Forum', guild_id: 'guild', type: 15 } },
}));
vi.mock('@discordy/core/application/stores/guildStore', () => {
  const store = (selector: (state: unknown) => unknown) => selector({ channels: fixture.channels });
  store.getState = () => ({ upsertChannel: fixture.upsertChannel });
  return { useGuildStore: store };
});
vi.mock('@discordy/core/application/stores/uiStore', () => ({ useUiStore: (selector: (state: unknown) => unknown) => selector({ setSidePanel: fixture.setSidePanel }) }));
vi.mock('@renderer/interface/app/runtime', () => ({ getRuntime: () => ({ api: { createThread: fixture.createThread }, privacy: { sender: { send: fixture.send } } }) }));
vi.mock('@renderer/interface/app/actions', () => ({ attempt: async (fn: () => Promise<unknown>) => { try { return await fn(); } catch { return undefined; } } }));

beforeEach(() => {
  vi.resetAllMocks();
  fixture.createThread.mockResolvedValue({ id: 'post', type: 11, parent_id: 'forum', delivery_mode: 'standard' });
  fixture.send.mockResolvedValue({ id: 'message' });
});
afterEach(cleanup);

it('creates a post and sends its first message through the normal delivery path', async () => {
  render(<ForumView channelId="forum" />);
  fireEvent.click(screen.getByRole('button', { name: 'New post' }));
  fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'A title' } });
  fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'First message' } });
  fireEvent.click(screen.getByRole('button', { name: 'Post' }));
  await waitFor(() => expect(fixture.send).toHaveBeenCalledWith(expect.objectContaining({ id: 'post', guild_id: 'guild' }), { content: 'First message' }));
  expect(fixture.createThread).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(fixture.setSidePanel).toHaveBeenCalledWith({ kind: 'thread', threadId: 'post' }));
});

it('retains the message and retries without creating another post after delivery fails', async () => {
  fixture.send.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ id: 'message' });
  render(<ForumView channelId="forum" />);
  fireEvent.click(screen.getByRole('button', { name: 'New post' }));
  fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'A title' } });
  fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'First message' } });
  fireEvent.click(screen.getByRole('button', { name: 'Post' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Retry message' }));
  await waitFor(() => expect(fixture.setSidePanel).toHaveBeenCalled());
  expect(fixture.createThread).toHaveBeenCalledTimes(1);
  expect(fixture.send).toHaveBeenCalledTimes(2);
});
