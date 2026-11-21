// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ForumSettings } from '@renderer/interface/features/settings/channel/ForumSettings';

const fixture = vi.hoisted(() => ({
  updateChannel: vi.fn(), upsertChannel: vi.fn(),
  channels: { forum: { id: 'forum', available_tags: [{ id: '12', name: 'Help', moderated: false }], require_tags: false, default_sort_order: 0, default_forum_layout: 0 } },
}));
vi.mock('@discordy/core/application/stores/guildStore', () => {
  const store = (selector: (state: unknown) => unknown) => selector({ channels: fixture.channels });
  store.getState = () => ({ upsertChannel: fixture.upsertChannel });
  return { useGuildStore: store };
});
vi.mock('@renderer/interface/app/runtime', () => ({ getRuntime: () => ({ api: { updateChannel: fixture.updateChannel } }) }));
vi.mock('@renderer/interface/app/actions', () => ({ attempt: async (fn: () => Promise<unknown>) => { try { return await fn(); } catch { return undefined; } } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it('updates a tag, requires tags and saves the selected defaults', async () => {
  fixture.updateChannel.mockResolvedValue({ id: 'forum', available_tags: [{ id: '12', name: 'Questions', moderated: true }] });
  render(<ForumSettings channelId="forum" />);
  fireEvent.change(screen.getByLabelText('Tag 1 name'), { target: { value: 'Questions' } });
  fireEvent.click(screen.getByLabelText('Moderators only'));
  fireEvent.click(screen.getByLabelText('Require a tag'));
  fireEvent.change(screen.getByLabelText('Default sort'), { target: { value: '1' } });
  fireEvent.change(screen.getByLabelText('Default layout'), { target: { value: '2' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save forum settings' }));
  await waitFor(() => expect(fixture.updateChannel).toHaveBeenCalledWith('forum', expect.objectContaining({
    available_tags: [{ id: '12', name: 'Questions', moderated: true }], require_tags: true, default_sort_order: 1, default_forum_layout: 2,
  })));
  expect(fixture.upsertChannel).toHaveBeenCalled();
});
