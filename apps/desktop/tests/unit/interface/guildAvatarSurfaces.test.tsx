// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useVoiceStore } from '@discordy/core/application/stores/voiceStore';
import type { ChatMessage } from '@discordy/core/application/stores/messageStore';
import type { GuildMember, VoiceState } from '@discordy/core/contracts/rest';
import { useConnectionStore } from '@renderer/interface/app/connectionStore';
import { MessageItem } from '@renderer/interface/features/chat/MessageItem';
import { VoiceOccupant } from '@renderer/interface/features/channels/ChannelSidebar';
import { VideoTile } from '@renderer/interface/features/voice/Participants';
import { UserAvatar } from '@renderer/interface/shared/ui/UserAvatar';

vi.mock('@renderer/interface/app/runtime', () => ({ getRuntime: () => ({ gateway: { send: vi.fn() }, api: {} }) }));

const user = { id: '7', username: 'Sam', global_name: null, avatar: 'global' };
const member: GuildMember = { user, avatar: 'server', roles: [], joined_at: '2026-01-01T00:00:00Z', mute: false, deaf: false };
const state = { guild_id: '9', channel_id: '2', user_id: '7', member, self_mute: false, self_deaf: false, mute: false, deaf: false } as VoiceState;
const message = { id: '10', channel_id: '2', guild_id: '9', author: user, content: 'Hello', timestamp: '2026-01-01T00:00:00Z', type: 0, flags: 0, mentions: [], mention_roles: [], attachments: [], embeds: [], reactions: [] } as unknown as ChatMessage;

beforeEach(() => {
  useConnectionStore.setState({ cdnUrl: 'https://cdn.test' });
  useGuildStore.setState({ guilds: { '9': { id: '9', name: 'Guild', owner_id: '7', roles: [] } } as never, members: { '9': { '7': member } }, channels: { '2': { id: '2', guild_id: '9', type: 2, name: 'Lounge' } } as never });
  useVoiceStore.setState({ states: { '9': { '7': state } }, speaking: { '7': 0.8 } });
});
afterEach(cleanup);

describe('server avatars on chat and voice surfaces', () => {
  it.each(['message', 'voice row', 'voice tile'])('renders the server image on the %s and reacts to clearing it', (surface) => {
    const { container } = render(surface === 'message'
      ? <MessageItem message={message} startsGroup guildId="9" onRetry={vi.fn()} onDiscard={vi.fn()} />
      : surface === 'voice row'
        ? <ul><VoiceOccupant guildId="9" state={state} speaking={0.8} /></ul>
        : <VideoTile participant={{ state, name: 'Sam', avatar: 'global', isSelf: false }} stream={null} kind="avatar" />);
    expect(container.querySelector('img')?.getAttribute('src')).toBe('https://cdn.test/guilds/9/users/7/avatars/server.png?size=128');
    if (surface !== 'message') expect(container.querySelector('.avatar.is-speaking')).toBeTruthy();
    act(() => useGuildStore.setState({ members: { '9': { '7': { ...member, avatar: null } } } }));
    expect(container.querySelector('img')?.getAttribute('src')).toBe('https://cdn.test/avatars/7/global.png?size=128');
  });

  it('keeps the global image for a DM even while the same user has a server override', () => {
    const { container } = render(<MessageItem message={{ ...message, guild_id: undefined }} startsGroup guildId={null} onRetry={vi.fn()} onDiscard={vi.fn()} />);
    expect(container.querySelector('img')?.getAttribute('src')).toBe('https://cdn.test/avatars/7/global.png?size=128');
  });

  it('keeps server scope, animated images, failure initials and presence through profile updates', () => {
    const { container, rerender } = render(<UserAvatar id="7" name="Sam" avatar="global" guildId="9" status="online" />);
    act(() => useGuildStore.setState({ members: { '9': { '7': { ...member, avatar: 'a_animated' } }, '8': { '7': { ...member, avatar: 'other' } } } }));
    expect(container.querySelector('img')?.getAttribute('src')).toBe('https://cdn.test/guilds/9/users/7/avatars/a_animated.gif?size=128');
    fireEvent.error(container.querySelector('img')!);
    expect(screen.getByText('SA')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'online' })).toBeTruthy();
    rerender(<UserAvatar id="7" name="Sam" avatar="global" guildId="8" status="online" />);
    expect(container.querySelector('img')?.getAttribute('src')).toBe('https://cdn.test/guilds/8/users/7/avatars/other.png?size=128');
    rerender(<UserAvatar id="7" name="Sam" avatar="global" status="online" />);
    expect(container.querySelector('img')?.getAttribute('src')).toBe('https://cdn.test/avatars/7/global.png?size=128');
  });
});
