// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { ChannelType, type Channel, type User } from '@discordy/core/contracts/rest';
import { FollowAnnouncementDialog } from '@renderer/interface/features/chat/FollowAnnouncementDialog';

const fixture = vi.hoisted(() => ({ follow: vi.fn(), close: vi.fn() }));
vi.mock('@renderer/interface/app/runtime', () => ({ getRuntime: () => ({ api: { followAnnouncement: fixture.follow }, privacy: { sender: { resolveMode: () => 'standard' } } }) }));
vi.mock('@renderer/interface/app/actions', () => ({ attempt: (run: () => Promise<unknown>) => run() }));

beforeEach(() => {
  vi.clearAllMocks();
  fixture.follow.mockResolvedValue({ channel_id: '10', webhook_id: '50' });
  useGuildStore.getState().reset();
  useSessionStore.setState({ user: { id: '7', username: 'owner' } as User });
  useGuildStore.setState({
    guilds: { '1': { id: '1', name: 'Source', owner_id: '7', roles: [] }, '2': { id: '2', name: 'Target', owner_id: '7', roles: [] } } as never,
    channels: { '10': { id: '10', guild_id: '1', type: ChannelType.GUILD_ANNOUNCEMENT, name: 'news' }, '20': { id: '20', guild_id: '2', type: ChannelType.GUILD_TEXT, name: 'general' } },
  });
});
afterEach(cleanup);

it('follows an announcement into an eligible channel', async () => {
  const source = useGuildStore.getState().channels['10'] as Channel;
  render(<FollowAnnouncementDialog source={source} close={fixture.close} />);
  expect(screen.getByText('#general')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Follow into #general' }));
  await waitFor(() => expect(fixture.follow).toHaveBeenCalledWith('10', '20'));
  await waitFor(() => expect(fixture.close).toHaveBeenCalled());
});
