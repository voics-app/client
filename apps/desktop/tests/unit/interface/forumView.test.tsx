// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ForumView } from '@renderer/interface/features/chat/ForumView';

const fixture = vi.hoisted(() => ({
  createThread: vi.fn(), updateChannel: vi.fn(), send: vi.fn(), upsertChannel: vi.fn(), setSidePanel: vi.fn(), manages: false,
  channels: { forum: { id: 'forum', name: 'Forum', guild_id: 'guild', type: 15, require_tags: false, available_tags: [{ id: '12', name: 'Help' }] } },
}));
vi.mock('@discordy/core/application/stores/guildStore', () => {
  const store = (selector: (state: unknown) => unknown) => selector({ channels: fixture.channels });
  store.getState = () => ({ upsertChannel: fixture.upsertChannel });
  return { useGuildStore: store };
});
vi.mock('@discordy/core/application/stores/uiStore', () => ({ useUiStore: (selector: (state: unknown) => unknown) => selector({ setSidePanel: fixture.setSidePanel }) }));
vi.mock('@renderer/interface/shared/hooks/usePermissions', () => ({ useChannelPermissions: () => 0n, can: () => fixture.manages }));
vi.mock('@renderer/interface/app/runtime', () => ({ getRuntime: () => ({ api: { createThread: fixture.createThread, updateChannel: fixture.updateChannel }, privacy: { sender: { send: fixture.send } } }) }));
vi.mock('@renderer/interface/app/actions', () => ({ attempt: async (fn: () => Promise<unknown>) => { try { return await fn(); } catch { return undefined; } } }));

beforeEach(() => {
  vi.resetAllMocks();
  fixture.manages = false;
  fixture.channels.forum.require_tags = false;
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

it('retains the message and opens the post without resending after an ambiguous failure', async () => {
  fixture.send.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ id: 'message' });
  render(<ForumView channelId="forum" />);
  fireEvent.click(screen.getByRole('button', { name: 'New post' }));
  fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'A title' } });
  fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'First message' } });
  fireEvent.click(screen.getByRole('button', { name: 'Post' }));
  expect((await screen.findByLabelText('Message') as HTMLTextAreaElement).value).toBe('First message');
  fireEvent.click(await screen.findByRole('button', { name: 'Open post' }));
  await waitFor(() => expect(fixture.setSidePanel).toHaveBeenCalled());
  expect(fixture.createThread).toHaveBeenCalledTimes(1);
  expect(fixture.send).toHaveBeenCalledTimes(1);
});


it('requires a selected tag and sends it with a new post', async () => {
  fixture.channels.forum.require_tags = true;
  render(<ForumView channelId="forum" />);
  fireEvent.click(screen.getByRole('button', { name: 'New post' }));
  fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Question' } });
  fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Please help' } });
  expect((screen.getByRole('button', { name: 'Post' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByLabelText('Help'));
  fireEvent.click(screen.getByRole('button', { name: 'Post' }));
  await waitFor(() => expect(fixture.createThread).toHaveBeenCalledWith('forum', expect.objectContaining({ applied_tags: ['12'] })));
});
