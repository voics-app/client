import { act, cleanup, fireEvent, render, screen } from '@testing-library/react-native';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { usePresenceStore } from '@discordy/core/application/stores/peopleStores';
import { useVoiceStore } from '@discordy/core/application/stores/voiceStore';
import type { GuildMember } from '@discordy/core/contracts/rest';
import { MemberRowView } from '../../src/members/MemberRowView';
import { StatusAvatar } from '../../src/members/StatusAvatar';
import { Avatar } from '../../src/profile/Avatar';
import { OccupantList } from '../../src/voice/OccupantList';
import { VoiceStage } from '../../src/voice/VoiceStage';

jest.mock('../../src/brand', () => ({ BRAND: { cdnUrl: 'https://cdn.test' } }));

const user = { id: '7', username: 'Sam', global_name: null, avatar: 'global' };
const member: GuildMember = { user, avatar: 'server', roles: [], joined_at: '2026-01-01T00:00:00Z', mute: false, deaf: false };

beforeEach(() => {
  useGuildStore.setState({ members: { '9': { '7': member } } });
  useVoiceStore.setState({ states: {} });
});

it('uses the server-scoped image in a member row without losing its status', async () => {
  useGuildStore.setState({ members: { '9': { '7': member } } });
  usePresenceStore.setState({ byUser: { '7': { status: 'online', activities: [] } } });
  await render(<MemberRowView member={member} guild={{ id: '9', name: 'Guild', owner_id: '7', roles: [] } as never} onPress={jest.fn()} />);
  expect(screen.getByLabelText('Sam avatar').props.source.uri).toBe('https://cdn.test/guilds/9/users/7/avatars/server.png?size=72');
  expect(screen.getByTestId('status-online')).toBeTruthy();
});

it('uses the server image in the voice channel row and stage tile', async () => {
  useVoiceStore.setState({ states: { '9': { '7': { guild_id: '9', channel_id: '2', user_id: '7', member, self_mute: false, self_deaf: false, mute: false, deaf: false } } } as never });
  await render(<OccupantList channel={{ id: '2', guild_id: '9', nsfw: false, type: 2 } as never} />);
  expect(screen.getByLabelText('Sam avatar').props.source.uri).toBe('https://cdn.test/guilds/9/users/7/avatars/server.png?size=72');
  await cleanup();
  const tile = { key: '7:camera', userId: '7', kind: 'camera', hasVideo: false, stream: null, watchable: false, row: { userId: '7', name: 'Sam', user, self: false, muted: false, deafened: false, speaking: true } } as const;
  await render(<VoiceStage view={{ mode: 'grid', columns: 1, tiles: [tile] }} guildId="9" facing="front" onFocus={jest.fn()} />);
  expect(screen.getByLabelText('Sam avatar').props.source.uri).toBe('https://cdn.test/guilds/9/users/7/avatars/server.png?size=128');
  expect(screen.getByLabelText('Video tile, Sam, speaking')).toBeTruthy();
});

it('retries changed images after failure, preserves status and restores global images when cleared', async () => {
  useGuildStore.setState({ members: { '9': { '7': { ...member, avatar: 'a_animated' } } } });
  await render(<StatusAvatar user={user} guildId="9" status="online" size={36} />);
  expect(screen.getByLabelText('Sam avatar').props.source.uri).toContain('/avatars/a_animated.gif?size=72');
  await fireEvent(screen.getByLabelText('Sam avatar'), 'error');
  expect(screen.getByText('S')).toBeTruthy();
  expect(screen.getByTestId('status-online')).toBeTruthy();
  await act(() => useGuildStore.setState({ members: { '9': { '7': { ...member, avatar: 'changed' } } } }));
  expect(screen.getByLabelText('Sam avatar').props.source.uri).toContain('/guilds/9/users/7/avatars/changed.png');
  await act(() => useGuildStore.setState({ members: { '9': { '7': { ...member, avatar: null } } } }));
  expect(screen.getByLabelText('Sam avatar').props.source.uri).toContain('/avatars/7/global.png');
});

it('keeps DM avatars global even when server member data is loaded', async () => {
  await render(<Avatar user={user} size={36} />);
  expect(screen.getByLabelText('Sam avatar').props.source.uri).toBe('https://cdn.test/avatars/7/global.png?size=72');
});
