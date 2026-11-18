// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { usePresenceStore, useRelationshipStore, useTypingStore } from '@discordy/core/application/stores/peopleStores';
import { useVoiceStore } from '@discordy/core/application/stores/voiceStore';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import { FriendsView } from '@renderer/interface/features/home/FriendsView';
import { HomeSidebar } from '@renderer/interface/features/home/HomeSidebar';

const calls = vi.hoisted(() => ({ join: vi.fn(), close: vi.fn() }));
vi.mock('@renderer/interface/app/runtime', () => ({ getRuntime: () => ({ api: {} }) }));
vi.mock('@renderer/interface/app/voiceActions', () => ({ openVoiceChannel: calls.join }));
vi.mock('@renderer/interface/app/dmActions', () => ({ closeDm: calls.close }));

beforeEach(() => {
  vi.clearAllMocks();
  useSessionStore.setState({ user: { id: 'me' } as never, settings: { default_delivery_mode: 'standard' } });
  useGuildStore.setState({ guilds: { g: { id: 'g', owner_id: 'me', name: 'Friends', roles: [] } } as never, members: {}, channels: {
    dm: { id: 'dm', type: 1, delivery_mode: 'standard', recipients: [{ id: 'friend', username: 'Friend', global_name: null, avatar: null }] },
    voice: { id: 'voice', guild_id: 'g', type: 2, delivery_mode: 'standard', name: 'Lounge' },
  } });
  useRelationshipStore.setState({ byUser: { friend: { id: 'friend', type: 1, user: { id: 'friend', username: 'Friend', global_name: null, avatar: null } } } });
  usePresenceStore.setState({ byUser: { friend: { status: 'online', activities: [{ type: 4, name: 'Custom Status', state: 'Building' }] } } });
  useTypingStore.setState({ byChannel: {} });
  useVoiceStore.setState({ states: {}, call: { status: 'idle' } as never });
  useUiStore.setState({ view: { kind: 'home', channelId: null } });
});
afterEach(cleanup);

it('shows custom status, then typing, and closes a DM without opening it', () => {
  render(<HomeSidebar />);
  expect(screen.getByText('Building')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Close conversation with Friend' }));
  expect(calls.close).toHaveBeenCalledWith('dm');
  expect(useUiStore.getState().view.channelId).toBeNull();
});

it('shows typing only while the remote participant typing marker is live', () => {
  useTypingStore.setState({ byChannel: { dm: { me: Date.now() + 10000, friend: Date.now() + 10000 } } });
  render(<HomeSidebar />);
  expect(screen.getByRole('status', { name: 'Friend is typing' })).toBeTruthy();
});

it('joins a known server voice activity and excludes inaccessible DM activities', () => {
  useVoiceStore.setState({ states: { g: { friend: { user_id: 'friend', guild_id: 'g', channel_id: 'voice' } } } as never });
  const { unmount } = render(<FriendsView />);
  fireEvent.click(within(screen.getByRole('complementary', { name: 'Active Now' })).getByRole('button', { name: 'Join voice' }));
  expect(calls.join).toHaveBeenCalledWith('g', 'voice');
  unmount();
  useVoiceStore.setState({ states: { '@me': { friend: { user_id: 'friend', guild_id: null, channel_id: 'unknown-private' } } } as never });
  render(<FriendsView />);
  expect(screen.queryByRole('button', { name: 'Join voice' })).toBeNull();
});
