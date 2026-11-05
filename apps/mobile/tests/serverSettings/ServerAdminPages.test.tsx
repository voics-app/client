import { Alert } from 'react-native';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import { renderRouter } from 'expo-router/testing-library';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useReadStateStore } from '@discordy/core/application/stores/peopleStores';
import { useNotificationSettingsStore } from '@discordy/core/application/stores/notificationSettingsStore';
import { Permission } from '@discordy/core/contracts/permissions';
import type { AuditLog, Ban, Channel } from '@discordy/core/contracts/rest';
import { PAT, resetStores, seedServer } from '../support/server';

const mockApi = {
  messages: jest.fn(async () => []),
  ack: jest.fn(async (_c: string, _m: string) => undefined),
  bans: jest.fn(async (_g: string): Promise<Ban[]> => [{ user: PAT, reason: 'spam' }]),
  unban: jest.fn(async (_g: string, _u: string) => undefined),
  auditLog: jest.fn(async (_g: string, _q: object): Promise<AuditLog> => ({ audit_log_entries: [{ id: '1000', target_id: 'u2', user_id: 'u3', action_type: 22, reason: 'raid' }], users: [{ id: 'u3', username: 'sam', global_name: 'Sam', avatar: null }] })),
  createEmoji: jest.fn(async (_g: string, body: { name: string }) => ({ id: 'e2', name: body.name, animated: false })),
  updateEmoji: jest.fn(async (_g: string, id: string, patch: { name: string }) => ({ id, animated: false, ...patch })),
  deleteEmoji: jest.fn(async (_g: string, _id: string) => undefined),
  addMemberRole: jest.fn(async (_g: string, _u: string, _r: string) => undefined),
  removeMemberRole: jest.fn(async (_g: string, _u: string, _r: string) => undefined),
  updateMember: jest.fn(async (_g: string, _u: string, patch: object) => ({ user: PAT, roles: ['regular'], joined_at: '2024-01-02T00:00:00Z', ...patch })),
  ban: jest.fn(async (_g: string, _u: string, _reason?: string, _o?: object) => undefined),
  reorderRoles: jest.fn(async (_g: string, changes: { id: string; position: number }[]) => changes.map((c) => ({ id: c.id, name: c.id, color: 0, hoist: false, position: c.position, permissions: '0', managed: false, mentionable: false }))),
  reorderChannels: jest.fn(async (_g: string, _m: object[]) => undefined),
  updateChannel: jest.fn(async (id: string, patch: object) => ({ id, ...patch })),
  putOverwrite: jest.fn(async (_c: string, _o: object) => undefined),
  deleteOverwrite: jest.fn(async (_c: string, _o: string) => undefined),
  deleteGuild: jest.fn(async (_g: string) => undefined),
  updateGuildNotificationSettings: jest.fn(async (_g: string | null, patch: object) => ({ guild_id: 'g1', message_notifications: null, suppress_everyone: false, suppress_roles: false, muted: false, mute_config: null, hide_muted_channels: false, channel_overrides: [], ...patch })),
};
const mockSession = { boot: jest.fn(), login: jest.fn(), loginMfa: jest.fn(), logout: jest.fn() };
jest.mock('../../src/runtime', () => ({ getRuntime: () => ({ session: mockSession, gateway: { state: 'idle', resumeNow: jest.fn(), send: jest.fn() }, api: mockApi, apiUrl: 'https://api.test' }) }));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn(async () => ({ canceled: true })) }));

const alertButtons = () => (Alert.alert as jest.Mock).mock.calls.at(-1)![2] as { text: string; style?: string; onPress?: () => void }[];
const confirmAlert = (label: string) => alertButtons().find((b) => b.text === label)!.onPress!();

async function openPage(page: string, path = '/servers/g1') {
  await renderRouter('./app', { initialUrl: path });
  await fireEvent.press(await screen.findByLabelText('Home Base server menu'));
  await fireEvent.press(await screen.findByLabelText('Server settings'));
  await fireEvent.press(await screen.findByLabelText(page));
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  resetStores();
  useReadStateStore.getState().reset();
  useNotificationSettingsStore.getState().hydrate([]);
});

describe('bans', () => {
  it('lists bans with their reason, searches them, and unbans after a question', async () => {
    seedServer(Permission.BAN_MEMBERS | Permission.MANAGE_GUILD);
    await openPage('Bans');
    expect(await screen.findByText('spam')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Search bans'), 'zzz');
    expect(await screen.findByText('No matching bans.')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Search bans'), 'spam');
    await fireEvent.press(await screen.findByLabelText('Unban Pat'));
    expect(mockApi.unban).not.toHaveBeenCalled();
    confirmAlert('Unban');
    await waitFor(() => expect(mockApi.unban).toHaveBeenCalledWith('g1', 'u2'));
    expect(await screen.findByText('Nobody is banned from this server.')).toBeTruthy();
  });

  it('is not offered without Ban Members', async () => {
    seedServer(Permission.MANAGE_GUILD);
    await renderRouter('./app', { initialUrl: '/servers/g1' });
    await fireEvent.press(await screen.findByLabelText('Home Base server menu'));
    await fireEvent.press(await screen.findByLabelText('Server settings'));
    await screen.findByLabelText('Overview');
    expect(screen.queryByLabelText('Bans')).toBeNull();
  });
});

describe('audit log', () => {
  it('shows who did what and filters by action', async () => {
    seedServer(Permission.VIEW_AUDIT_LOG | Permission.MANAGE_GUILD);
    await openPage('Audit log');
    expect(await screen.findByText('Sam banned a member')).toBeTruthy();
    expect(screen.getByText(/Reason: raid/)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Filter by action: All actions'));
    await fireEvent.press(await screen.findByLabelText('Bans'));
    await waitFor(() => expect(mockApi.auditLog).toHaveBeenLastCalledWith('g1', expect.objectContaining({ action_type: 22 })));
  });

  it('pages older entries with the last id as before', async () => {
    mockApi.auditLog.mockResolvedValueOnce({ audit_log_entries: Array.from({ length: 100 }, (_, i) => ({ id: String(2000 - i), target_id: null, user_id: null, action_type: 1 })), users: [] });
    seedServer(Permission.VIEW_AUDIT_LOG | Permission.MANAGE_GUILD);
    await openPage('Audit log');
    await fireEvent.press(await screen.findByLabelText('Load older entries'));
    await waitFor(() => expect(mockApi.auditLog).toHaveBeenLastCalledWith('g1', expect.objectContaining({ before: '1901' })));
  });
});

describe('emoji', () => {
  const seedEmoji = () => {
    seedServer(Permission.MANAGE_GUILD_EXPRESSIONS | Permission.MANAGE_GUILD);
    useGuildStore.getState().setEmojis('g1', [{ id: 'e1', name: 'wave', animated: false } as never]);
  };

  it('lists, renames and deletes after a question', async () => {
    seedEmoji();
    await openPage('Emoji');
    await fireEvent.press(await screen.findByLabelText('Rename wave'));
    await fireEvent.changeText(await screen.findByLabelText('Emoji name'), 'big wave');
    await fireEvent.press(screen.getByLabelText('Save name'));
    await waitFor(() => expect(mockApi.updateEmoji).toHaveBeenCalledWith('g1', 'e1', { name: 'big_wave' }));
    await fireEvent.press(await screen.findByLabelText('Delete big_wave'));
    expect(mockApi.deleteEmoji).not.toHaveBeenCalled();
    confirmAlert('Delete emoji');
    await waitFor(() => expect(mockApi.deleteEmoji).toHaveBeenCalledWith('g1', 'e1'));
  });

  it('uploads a picked image under a name from its file', async () => {
    seedEmoji();
    jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///x.png', fileName: 'party.png', mimeType: 'image/png', base64: 'AAAA', width: 1, height: 1 }] } as never);
    await openPage('Emoji');
    await fireEvent.press(await screen.findByLabelText('Upload emoji'));
    await waitFor(() => expect(mockApi.createEmoji).toHaveBeenCalledWith('g1', { name: 'party', image: 'data:image/png;base64,AAAA' }));
    await waitFor(() => expect(useGuildStore.getState().guilds['g1']?.emojis).toHaveLength(2));
  });
});

describe('members: roles, timeout, nickname, ban options', () => {
  const MOD = Permission.MANAGE_ROLES | Permission.MODERATE_MEMBERS | Permission.MANAGE_NICKNAMES | Permission.BAN_MEMBERS;

  it('gives and takes a role below the user, never one at or above their own', async () => {
    seedServer(MOD);
    await openPage('Members');
    await fireEvent.press(await screen.findByLabelText('Moderate Pat'));
    await fireEvent.press(await screen.findByLabelText('Roles'));
    expect(screen.queryByLabelText('Role Staff')).toBeNull();
    await fireEvent(await screen.findByLabelText('Role Mods'), 'valueChange', true);
    await waitFor(() => expect(mockApi.addMemberRole).toHaveBeenCalledWith('g1', 'u2', 'mods'));
    await fireEvent(screen.getByLabelText('Role Regulars'), 'valueChange', false);
    await waitFor(() => expect(mockApi.removeMemberRole).toHaveBeenCalledWith('g1', 'u2', 'regular'));
  });

  it('times a member out for a preset and removes it again', async () => {
    seedServer(MOD);
    await openPage('Members');
    await fireEvent.press(await screen.findByLabelText('Moderate Pat'));
    await fireEvent.press(await screen.findByLabelText('Timeout'));
    await fireEvent.press(await screen.findByLabelText('10 minutes'));
    await waitFor(() => expect(mockApi.updateMember).toHaveBeenCalledWith('g1', 'u2', { communication_disabled_until: expect.any(String) }));
    await fireEvent.press(await screen.findByLabelText('Moderate Pat'));
    await fireEvent.press(await screen.findByLabelText('Timeout (change or remove)'));
    await fireEvent.press(await screen.findByLabelText('Remove timeout'));
    await waitFor(() => expect(mockApi.updateMember).toHaveBeenLastCalledWith('g1', 'u2', { communication_disabled_until: null }));
  });

  it('changes a nickname and clears it with an empty one', async () => {
    seedServer(MOD);
    await openPage('Members');
    await fireEvent.press(await screen.findByLabelText('Moderate Pat'));
    await fireEvent.press(await screen.findByLabelText('Change nickname'));
    await fireEvent.changeText(await screen.findByLabelText('Server nickname'), ' Patty ');
    await fireEvent.press(screen.getByLabelText('Save'));
    await waitFor(() => expect(mockApi.updateMember).toHaveBeenCalledWith('g1', 'u2', { nick: 'Patty' }));
  });

  it('bans with the message history window and a reason', async () => {
    seedServer(MOD);
    await openPage('Members');
    await fireEvent.press(await screen.findByLabelText('Moderate Pat'));
    await fireEvent.press(await screen.findByLabelText('Ban'));
    await fireEvent.press(await screen.findByLabelText('Delete message history: Previous 24 hours'));
    await fireEvent.changeText(screen.getByLabelText('Reason (optional)'), ' spam ');
    await fireEvent.press(screen.getAllByLabelText('Ban')[0]!);
    await waitFor(() => expect(mockApi.ban).toHaveBeenCalledWith('g1', 'u2', 'spam', { delete_message_seconds: 86400 }));
  });

  it('offers a member with only Change Nickname just their own server profile', async () => {
    seedServer(Permission.CHANGE_NICKNAME | Permission.MANAGE_GUILD);
    await openPage('Members');
    await screen.findByText(/^pat · joined /);
    expect(screen.queryByLabelText('Moderate Pat')).toBeNull();
    await fireEvent.press(await screen.findByLabelText('Moderate Me Myself'));
    expect(await screen.findByLabelText('Edit server profile')).toBeTruthy();
    expect(screen.queryByLabelText('Kick')).toBeNull();
  });
});

describe('role order', () => {
  it('moves a role down one place and saves the new positions, never above the user', async () => {
    seedServer(Permission.MANAGE_ROLES);
    await openPage('Roles');
    await fireEvent.press(await screen.findByLabelText('Reorder'));
    expect(screen.getByLabelText('Move Staff up').props.accessibilityState.disabled).toBe(true);
    expect(screen.getByLabelText('Move Mods up').props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByLabelText('Move Mods down'));
    await waitFor(() => expect(mockApi.reorderRoles).toHaveBeenCalledWith('g1', expect.arrayContaining([{ id: 'mods', position: 1 }, { id: 'regular', position: 2 }])));
  });
});

describe('channel order and settings', () => {
  it('moves a channel one place with the up and down buttons and saves the new order', async () => {
    seedServer(Permission.MANAGE_CHANNELS);
    await openPage('Channels');
    await fireEvent.press(await screen.findByLabelText('Reorder'));
    expect(screen.getByLabelText('Move ideas down').props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByLabelText('Move general down'));
    await waitFor(() => expect(mockApi.reorderChannels).toHaveBeenCalledWith('g1', expect.arrayContaining([{ id: 'secret', position: 0 }])));
  });

  it('saves the topic, slowmode and age restriction of a text channel', async () => {
    seedServer(Permission.MANAGE_CHANNELS);
    await openPage('Channels');
    await fireEvent.press(await screen.findByLabelText('Edit general'));
    await fireEvent.changeText(await screen.findByLabelText('Topic'), 'Welcome');
    await fireEvent.press(screen.getByLabelText('Slowmode: 30s'));
    await fireEvent(screen.getByLabelText('Age-restricted channel'), 'valueChange', true);
    await fireEvent.press(screen.getByLabelText('Save changes'));
    await waitFor(() => expect(mockApi.updateChannel).toHaveBeenCalledWith('general', { name: 'general', nsfw: true, topic: 'Welcome', rate_limit_per_user: 30 }));
  });

  it('shows the voice limits, not topic or slowmode, for a voice channel', async () => {
    seedServer(Permission.MANAGE_CHANNELS);
    await openPage('Channels');
    await fireEvent.press(await screen.findByLabelText('Edit lobby'));
    expect(await screen.findByLabelText('User limit (0 = unlimited)')).toBeTruthy();
    expect(screen.queryByLabelText('Topic')).toBeNull();
    expect(screen.queryByLabelText('Slowmode: Off')).toBeNull();
  });

  it('edits permission overwrites and saves only what changed', async () => {
    seedServer(Permission.MANAGE_CHANNELS);
    await openPage('Channels');
    await fireEvent.press(await screen.findByLabelText('Edit general'));
    await fireEvent.press(await screen.findByLabelText('Section: Permissions'));
    await fireEvent.press(await screen.findByLabelText('Overwrites for @everyone'));
    await fireEvent.press(await screen.findByLabelText('Send messages: Deny'));
    await fireEvent.press(screen.getByLabelText('Save permissions'));
    await waitFor(() => expect(mockApi.putOverwrite).toHaveBeenCalledWith('general', expect.objectContaining({ id: 'g1', type: 0, deny: expect.not.stringMatching(/^0$/) })));
    expect(mockApi.deleteOverwrite).not.toHaveBeenCalled();
    expect(useGuildStore.getState().channels['general']?.permission_overwrites).toHaveLength(1);
  });

  it('adds a role overwrite and removes it again', async () => {
    seedServer(Permission.MANAGE_CHANNELS);
    useGuildStore.getState().upsertChannel({ ...useGuildStore.getState().channels['general']!, permission_overwrites: [{ id: 'mods', type: 0, allow: '0', deny: '0' }] } as Channel);
    await openPage('Channels');
    await fireEvent.press(await screen.findByLabelText('Edit general'));
    await fireEvent.press(await screen.findByLabelText('Section: Permissions'));
    expect(await screen.findByLabelText('Overwrites for Mods')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Add role or member'));
    await fireEvent.press(await screen.findByLabelText('Regulars'));
    expect(screen.getByLabelText('Overwrites for Regulars')).toBeTruthy();
  });

  it('is not reachable without Manage Channels', async () => {
    seedServer(Permission.MANAGE_GUILD);
    await renderRouter('./app', { initialUrl: '/servers/g1/settings/channel/general' });
    expect(await screen.findByText("You don't have permission to use this page.")).toBeTruthy();
  });
});

describe('server menu', () => {
  async function openMenu(perms: bigint, owner = false) {
    seedServer(perms, { ownerIsMe: owner });
    await renderRouter('./app', { initialUrl: '/servers/g1' });
    await fireEvent.press(await screen.findByLabelText('Home Base server menu'));
  }

  it('marks every text channel of the server read', async () => {
    await openMenu(0n);
    useGuildStore.getState().upsertChannel({ ...useGuildStore.getState().channels['general']!, last_message_id: '77' } as Channel);
    await fireEvent.press(await screen.findByLabelText('Mark as read'));
    await waitFor(() => expect(mockApi.ack).toHaveBeenCalledWith('general', '77'));
  });

  it('mutes the server for a duration and unmutes it again', async () => {
    await openMenu(0n);
    await fireEvent.press(await screen.findByLabelText('Mute server'));
    await fireEvent.press(await screen.findByLabelText('For 1 hour'));
    await waitFor(() => expect(mockApi.updateGuildNotificationSettings).toHaveBeenCalledWith('g1', expect.objectContaining({ muted: true })));
    await fireEvent.press(await screen.findByLabelText('Home Base server menu'));
    await fireEvent.press(await screen.findByLabelText('Unmute server'));
    await waitFor(() => expect(mockApi.updateGuildNotificationSettings).toHaveBeenLastCalledWith('g1', expect.objectContaining({ muted: false })));
  });

  it('sets the notification level and a toggle', async () => {
    await openMenu(0n);
    await fireEvent.press(await screen.findByLabelText('Notification settings'));
    await fireEvent.press(await screen.findByLabelText('Only @mentions'));
    await waitFor(() => expect(mockApi.updateGuildNotificationSettings).toHaveBeenCalledWith('g1', { message_notifications: 1 }));
  });

  it('lets only the owner delete the server, after typing its name', async () => {
    await openMenu(0n);
    expect(screen.queryByLabelText('Delete server')).toBeNull();
  });

  it('deletes the server for the owner only when the name is typed back', async () => {
    await openMenu(0n, true);
    expect(screen.queryByLabelText('Leave server')).toBeNull();
    await fireEvent.press(await screen.findByLabelText('Delete server'));
    expect(screen.getByLabelText('Delete server').props.accessibilityState.disabled).toBe(true);
    await fireEvent.changeText(screen.getByLabelText('Type Home Base to confirm'), 'home');
    expect(screen.getByLabelText('Delete server').props.accessibilityState.disabled).toBe(true);
    await fireEvent.changeText(screen.getByLabelText('Type Home Base to confirm'), 'Home Base');
    await fireEvent.press(screen.getByLabelText('Delete server'));
    await waitFor(() => expect(mockApi.deleteGuild).toHaveBeenCalledWith('g1'));
    await waitFor(() => expect(useGuildStore.getState().guilds['g1']).toBeUndefined());
  });
});
