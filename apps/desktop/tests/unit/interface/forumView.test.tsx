// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ForumView } from '@renderer/interface/features/chat/ForumView';

const fixture = vi.hoisted(() => ({
  listForumPosts: vi.fn(), createThread: vi.fn(), updateChannel: vi.fn(), upsertChannel: vi.fn(), setSidePanel: vi.fn(), manages: false,
  drafts: {} as Record<string, { text: string }>,
  channels: { forum: { id: 'forum', name: 'Forum', guild_id: 'guild', type: 15, delivery_mode: 'standard', require_tags: false, available_tags: [{ id: '12', name: 'Help' }] } },
}));
vi.mock('@discordy/core/application/stores/guildStore', () => {
  const store = (selector: (state: unknown) => unknown) => selector({ channels: fixture.channels });
  store.getState = () => ({ upsertChannel: fixture.upsertChannel });
  return { useGuildStore: store };
});
vi.mock('@discordy/core/application/stores/sessionStore', () => ({ useSessionStore: (selector: (state: unknown) => unknown) => selector({ user: { id: 'alice' } }) }));
vi.mock('@discordy/core/application/stores/composerStores', () => ({ useDraftStore: { getState: () => ({ drafts: fixture.drafts, setDraft: (key: string, text: string) => { fixture.drafts[key] = { text }; }, clearDraft: (key: string) => { delete fixture.drafts[key]; } }) } }));
vi.mock('@discordy/core/application/stores/uiStore', () => ({ useUiStore: (selector: (state: unknown) => unknown) => selector({ setSidePanel: fixture.setSidePanel }) }));
vi.mock('@renderer/interface/shared/hooks/usePermissions', () => ({ useChannelPermissions: () => 0n, can: () => fixture.manages }));
vi.mock('@renderer/interface/app/runtime', () => ({ getRuntime: () => ({ api: { listForumPosts: fixture.listForumPosts, createThread: fixture.createThread, updateChannel: fixture.updateChannel } }) }));
vi.mock('@renderer/interface/app/actions', () => ({ attempt: async (fn: () => Promise<unknown>) => { try { return await fn(); } catch { return undefined; } } }));

beforeEach(() => {
  vi.resetAllMocks();
  fixture.manages = false;
  fixture.channels.forum.require_tags = false;
  fixture.channels.forum.delivery_mode = 'standard';
  fixture.drafts = {};
  fixture.listForumPosts.mockResolvedValue([]);
  fixture.createThread.mockResolvedValue({ id: 'post', type: 11, parent_id: 'forum', delivery_mode: 'standard', forum_post_status: 'published' });
});
afterEach(cleanup);

function fillPost() {
  fireEvent.click(screen.getByRole('button', { name: 'New post' }));
  fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'A title' } });
  fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'First message' } });
}

it('sends the first message with one reserved post request', async () => {
  render(<ForumView channelId="forum" />);
  fillPost();
  fireEvent.click(screen.getByRole('button', { name: 'Post' }));
  await waitFor(() => expect(fixture.createThread).toHaveBeenCalledWith('forum', expect.objectContaining({ name: 'A title', message: { content: 'First message' }, request_id: expect.any(String) })));
  await waitFor(() => expect(fixture.setSidePanel).toHaveBeenCalledWith({ kind: 'thread', threadId: 'post' }));
  expect(Object.keys(fixture.drafts)).toHaveLength(0);
});

it('retains the same request across an ambiguous failure and checks its status', async () => {
  fixture.createThread.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ id: 'post', forum_post_status: 'published' });
  render(<ForumView channelId="forum" />);
  fillPost();
  fireEvent.click(screen.getByRole('button', { name: 'Post' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Check status' }));
  await waitFor(() => expect(fixture.setSidePanel).toHaveBeenCalled());
  expect(fixture.createThread).toHaveBeenCalledTimes(2);
  expect(fixture.createThread.mock.calls[1]![1]).toEqual(fixture.createThread.mock.calls[0]![1]);
});

it('requires a selected tag and sends it with a new post', async () => {
  fixture.channels.forum.require_tags = true;
  render(<ForumView channelId="forum" />);
  fillPost();
  expect((screen.getByRole('button', { name: 'Post' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByLabelText('Help'));
  fireEvent.click(screen.getByRole('button', { name: 'Post' }));
  await waitFor(() => expect(fixture.createThread).toHaveBeenCalledWith('forum', expect.objectContaining({ applied_tags: ['12'] })));
});


it('does not submit plaintext for a private forum', () => {
  fixture.channels.forum.delivery_mode = 'ephemeral';
  render(<ForumView channelId="forum" />);
  fillPost();
  expect((screen.getByRole('button', { name: 'Post' }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText('New posts are not yet available in private delivery mode.')).toBeTruthy();
  expect(fixture.createThread).not.toHaveBeenCalled();
});
