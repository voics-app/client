import { Alert } from 'react-native';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';
import { renderRouter } from 'expo-router/testing-library';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { Permission } from '@discordy/core/contracts/permissions';
import { ChannelType, type Channel, type Invite } from '@discordy/core/contracts/rest';
import { ME, resetStores, seedServer } from '../support/server';

const ADMIN = Permission.MANAGE_GUILD | Permission.MANAGE_ROLES | Permission.MANAGE_CHANNELS | Permission.CREATE_INSTANT_INVITE | Permission.KICK_MEMBERS | Permission.BAN_MEMBERS;
const invite = (code: string): Invite => ({ code, uses: 1, max_uses: 5, inviter: ME, expires_at: null });

const mockApi = {
  messages: jest.fn(async () => []),
  kickMember: jest.fn(async (_g: string, _u: string) => undefined),
  ban: jest.fn(async (_g: string, _u: string) => undefined),
  createInvite: jest.fn(async (_c: string, _b: object) => invite('NEWCODE')),
  guildInvites: jest.fn(async (_g: string): Promise<Invite[]> => [invite('abc123')]),
  deleteInvite: jest.fn(async (_c: string) => undefined),
  updateRole: jest.fn(async (_g: string, id: string, patch: object) => ({ id, name: 'x', color: 0, hoist: false, position: 1, permissions: '0', managed: false, mentionable: false, ...patch })),
  createRole: jest.fn(async () => ({ id: 'new1', name: 'new role', color: 0, hoist: false, position: 1, permissions: '0', managed: false, mentionable: false })),
  deleteRole: jest.fn(async (_g: string, _r: string) => undefined),
  updateGuild: jest.fn(async (_g: string, patch: object) => ({ id: 'g1', ...patch })),
  createChannel: jest.fn(async (_g: string, body: object) => ({ id: 'newch', guild_id: 'g1', position: 9, delivery_mode: 'standard', ...body }) as unknown as Channel),
  updateChannel: jest.fn(async (id: string, patch: object) => ({ id, ...patch })),
  deleteChannel: jest.fn(async (_c: string) => undefined),
};
const mockSession = { boot: jest.fn(), login: jest.fn(), loginMfa: jest.fn(), logout: jest.fn() };
jest.mock('../../src/runtime', () => ({ getRuntime: () => ({ session: mockSession, gateway: { state: 'idle', resumeNow: jest.fn(), send: jest.fn() }, api: mockApi, apiUrl: 'https://api.test' }) }));
jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name, accessibilityLabel }: { name: string; accessibilityLabel?: string }) => <Text accessibilityLabel={accessibilityLabel}>{`icon:${name}`}</Text> };
});
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn(async () => ({ canceled: true })) }));

/** Runs the destructive button of the last Alert, like a tap on it. */
function confirmAlert(label: string) {
  const buttons = (Alert.alert as jest.Mock).mock.calls.at(-1)?.[2] as { text: string; onPress?: () => void }[];
  buttons.find((b) => b.text === label)!.onPress!();
}

async function openMenu() {
  await renderRouter('./app', { initialUrl: '/servers/g1' });
  await fireEvent.press(await screen.findByLabelText('Home Base server menu'));
}

async function openSettings(page?: string) {
  await openMenu();
  await fireEvent.press(await screen.findByLabelText('Server settings'));
  if (page) await fireEvent.press(await screen.findByLabelText(page));
}

describe('server menu', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    resetStores();
  });

  it('offers a plain member only Leave server', async () => {
    seedServer(0n);
    await openMenu();
    expect(await screen.findByLabelText('Leave server')).toBeTruthy();
    expect(screen.queryByLabelText('Invite people')).toBeNull();
    expect(screen.queryByLabelText('Server settings')).toBeNull();
  });

  it('asks before leaving, then leaves and drops the server', async () => {
    seedServer(0n);
    await openMenu();
    await fireEvent.press(await screen.findByLabelText('Leave server'));
    expect(await screen.findByText('You will need a new invite to rejoin.')).toBeTruthy();
    expect(mockApi.kickMember).not.toHaveBeenCalled();
    await fireEvent.press(screen.getAllByLabelText('Leave server')[0]!);
    await waitFor(() => expect(mockApi.kickMember).toHaveBeenCalledWith('g1', 'u1'));
    await waitFor(() => expect(useGuildStore.getState().guilds['g1']).toBeUndefined());
  });

  it('cancels leaving without calling the server', async () => {
    seedServer(0n);
    await openMenu();
    await fireEvent.press(await screen.findByLabelText('Leave server'));
    await fireEvent.press(await screen.findByLabelText('Cancel'));
    expect(mockApi.kickMember).not.toHaveBeenCalled();
  });

  it('does not offer the owner Leave server', async () => {
    seedServer(0n, { ownerIsMe: true });
    await openMenu();
    expect(await screen.findByLabelText('Server settings')).toBeTruthy();
    expect(screen.queryByLabelText('Leave server')).toBeNull();
  });

  it('creates an invite from the menu and offers to copy the link', async () => {
    seedServer(Permission.CREATE_INSTANT_INVITE);
    await openMenu();
    await fireEvent.press(await screen.findByLabelText('Invite people'));
    await fireEvent.press(screen.getByLabelText('Expire after: 7 days'));
    await fireEvent.press(screen.getByLabelText('Max uses: 5 uses'));
    await fireEvent.press(screen.getByLabelText('Generate invite link'));
    await waitFor(() => expect(mockApi.createInvite).toHaveBeenCalledWith('general', { max_age: 604800, max_uses: 5 }));
    expect(await screen.findByText('https://api.test/invite/NEWCODE')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Copy link'));
    await waitFor(() => expect(Clipboard.setStringAsync).toHaveBeenCalledWith('https://api.test/invite/NEWCODE'));
  });
});

describe('server settings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    resetStores();
  });

  it('lists the pages the permissions allow', async () => {
    seedServer(ADMIN);
    await openSettings();
    for (const page of ['Overview', 'Roles', 'Members', 'Invites', 'Channels']) expect(await screen.findByLabelText(page)).toBeTruthy();
  });

  it('lists only Members and Channels for someone who can manage channels', async () => {
    seedServer(Permission.MANAGE_CHANNELS);
    await openSettings();
    expect(await screen.findByLabelText('Channels')).toBeTruthy();
    expect(screen.getByLabelText('Members')).toBeTruthy();
    expect(screen.queryByLabelText('Roles')).toBeNull();
    expect(screen.queryByLabelText('Overview')).toBeNull();
    expect(screen.queryByLabelText('Invites')).toBeNull();
  });

  it('stops a deep link to a page the user may not open', async () => {
    seedServer(Permission.MANAGE_CHANNELS);
    await renderRouter('./app', { initialUrl: '/servers/g1/settings/roles' });
    expect(await screen.findByText("You don't have permission to use this page.")).toBeTruthy();
    expect(screen.queryByLabelText('Create role')).toBeNull();
  });

  it('saves a new server name from Overview, sending only what changed', async () => {
    seedServer(ADMIN);
    await openSettings('Overview');
    expect(screen.getByLabelText('Save changes').props.accessibilityState.disabled).toBe(true);
    await fireEvent.changeText(await screen.findByLabelText('Server name'), 'Renamed');
    await fireEvent.press(screen.getByLabelText('Save changes'));
    await waitFor(() => expect(mockApi.updateGuild).toHaveBeenCalledWith('g1', { name: 'Renamed' }));
    await waitFor(() => expect(useGuildStore.getState().guilds['g1']?.name).toBe('Renamed'));
  });

  describe('members', () => {
    it('offers Kick and Ban only for people below the user, each after a confirmation', async () => {
      seedServer(ADMIN);
      await openSettings('Members');
      expect(screen.queryByLabelText('Moderate Me Myself')).toBeNull();
      await fireEvent.press(await screen.findByLabelText('Moderate Pat'));
      await fireEvent.press(await screen.findByLabelText('Kick'));
      expect(await screen.findByText('They can rejoin with a new invite.')).toBeTruthy();
      expect(mockApi.kickMember).not.toHaveBeenCalled();
      await fireEvent.press(screen.getAllByLabelText('Kick')[0]!);
      await waitFor(() => expect(mockApi.kickMember).toHaveBeenCalledWith('g1', 'u2'));
      await waitFor(() => expect(screen.queryByLabelText('Moderate Pat')).toBeNull());
    });

    it('bans after confirming', async () => {
      seedServer(ADMIN);
      await openSettings('Members');
      await fireEvent.press(await screen.findByLabelText('Moderate Pat'));
      await fireEvent.press(await screen.findByLabelText('Ban'));
      expect(await screen.findByText('They are removed and cannot rejoin until unbanned.')).toBeTruthy();
      await fireEvent.press(screen.getAllByLabelText('Ban')[0]!);
      await waitFor(() => expect(mockApi.ban).toHaveBeenCalledWith('g1', 'u2'));
    });

    it('shows a member with no moderation rights as a plain row', async () => {
      seedServer(Permission.MANAGE_ROLES);
      await openSettings('Members');
      expect(await screen.findByText(/^pat · joined /)).toBeTruthy();
      expect(screen.queryByLabelText('Moderate Pat')).toBeNull();
    });
  });

  describe('roles', () => {
    it('lists the roles with member counts and locks none for the owner', async () => {
      seedServer(ADMIN, { ownerIsMe: true });
      await openSettings('Roles');
      expect(await screen.findByLabelText('Role Mods')).toBeTruthy();
      expect(screen.getAllByText('1 member').length).toBeGreaterThan(0);
      expect(screen.queryByLabelText('Locked')).toBeNull();
      expect(screen.getByLabelText('Role @everyone')).toBeTruthy();
    });

    it('edits a role name and colour and saves them', async () => {
      seedServer(ADMIN);
      await openSettings('Roles');
      await fireEvent.press(await screen.findByLabelText('Role Regulars'));
      await fireEvent.changeText(await screen.findByLabelText('Role name'), 'Locals');
      await fireEvent.press(screen.getByLabelText('Colour #30a46c'));
      await fireEvent.press(screen.getByLabelText('Save changes'));
      await waitFor(() => expect(mockApi.updateRole).toHaveBeenCalledWith('g1', 'regular', expect.objectContaining({ name: 'Locals', color: 0x30a46c })));
      await waitFor(() => expect(useGuildStore.getState().guilds['g1']?.roles.find((r) => r.id === 'regular')?.name).toBe('Locals'));
    });

    it('toggles a permission the user holds', async () => {
      seedServer(ADMIN);
      await openSettings('Roles');
      await fireEvent.press(await screen.findByLabelText('Role Regulars'));
      await fireEvent(await screen.findByLabelText('Kick members'), 'valueChange', true);
      await fireEvent.press(screen.getByLabelText('Save changes'));
      await waitFor(() => expect(mockApi.updateRole).toHaveBeenCalledWith('g1', 'regular', expect.objectContaining({ permissions: String(Permission.KICK_MEMBERS) })));
    });

    it('disables a permission switch the user does not hold', async () => {
      seedServer(Permission.MANAGE_ROLES);
      await openSettings('Roles');
      await fireEvent.press(await screen.findByLabelText('Role Regulars'));
      expect((await screen.findByLabelText('Ban members')).props.disabled).toBe(true);
      expect(screen.getByLabelText('Manage roles').props.disabled).toBe(false);
    });

    it('locks a role above the user and shows no save or delete', async () => {
      seedServer(Permission.MANAGE_ROLES);
      // Pat holds the top role here, so the test user (no roles) is below it.
      useGuildStore.getState().upsertMember('g1', { user: ME, roles: ['regular'], joined_at: '' } as never);
      await openSettings('Roles');
      await fireEvent.press(await screen.findByLabelText('Role Mods'));
      expect(await screen.findByText('You cannot edit this role because it is at or above your highest role.')).toBeTruthy();
      expect(screen.queryByLabelText('Save changes')).toBeNull();
      expect(screen.queryByLabelText('Delete role')).toBeNull();
    });

    it('creates a role and opens it', async () => {
      seedServer(ADMIN);
      await openSettings('Roles');
      await fireEvent.press(await screen.findByLabelText('Create role'));
      await waitFor(() => expect(mockApi.createRole).toHaveBeenCalledWith('g1', { name: 'new role', permissions: '0', color: 0 }));
      await waitFor(() => expect(screen).toHavePathname('/servers/g1/settings/roles/new1'));
    });

    it('deletes a role only after confirming', async () => {
      seedServer(ADMIN);
      await openSettings('Roles');
      await fireEvent.press(await screen.findByLabelText('Role Regulars'));
      await fireEvent.press(await screen.findByLabelText('Delete role'));
      expect(mockApi.deleteRole).not.toHaveBeenCalled();
      confirmAlert('Delete role');
      await waitFor(() => expect(mockApi.deleteRole).toHaveBeenCalledWith('g1', 'regular'));
      await waitFor(() => expect(useGuildStore.getState().guilds['g1']?.roles.some((r) => r.id === 'regular')).toBe(false));
    });
  });

  describe('invites', () => {
    it('lists active invites, copies one and revokes one after confirming', async () => {
      seedServer(ADMIN);
      await openSettings('Invites');
      expect(await screen.findByText('abc123')).toBeTruthy();
      expect(screen.getByText('by Me Myself · 1/5 uses · never expires')).toBeTruthy();
      await fireEvent.press(screen.getByLabelText('Copy invite abc123'));
      await waitFor(() => expect(Clipboard.setStringAsync).toHaveBeenCalledWith('https://api.test/invite/abc123'));
      await fireEvent.press(screen.getByLabelText('Revoke invite abc123'));
      expect(mockApi.deleteInvite).not.toHaveBeenCalled();
      confirmAlert('Revoke invite');
      await waitFor(() => expect(mockApi.deleteInvite).toHaveBeenCalledWith('abc123'));
      await waitFor(() => expect(screen.queryByText('abc123')).toBeNull());
    });

    it('creates an invite and shows its link, then refreshes the list', async () => {
      seedServer(ADMIN);
      await openSettings('Invites');
      await fireEvent.press(await screen.findByLabelText('Generate invite link'));
      expect(await screen.findByText('https://api.test/invite/NEWCODE')).toBeTruthy();
      await waitFor(() => expect(mockApi.guildInvites).toHaveBeenCalledTimes(2));
    });

    it('hides the create form without Create Invite', async () => {
      seedServer(Permission.MANAGE_GUILD);
      await openSettings('Invites');
      expect(await screen.findByText('abc123')).toBeTruthy();
      expect(screen.queryByLabelText('Generate invite link')).toBeNull();
    });

    it('offers a retry when the list cannot be loaded', async () => {
      seedServer(ADMIN);
      mockApi.guildInvites.mockRejectedValueOnce(new Error('offline'));
      await openSettings('Invites');
      await fireEvent.press(await screen.findByLabelText('Could not load invites. Try again'));
      expect(await screen.findByText('abc123')).toBeTruthy();
    });
  });

  describe('channels', () => {
    it('lists channels of every kind by category', async () => {
      seedServer(ADMIN);
      await openSettings('Channels');
      for (const label of ['Edit category Talk', 'Edit general', 'Edit secret', 'Edit lobby', 'Edit ideas']) expect(await screen.findByLabelText(label)).toBeTruthy();
    });

    it('creates a channel in a category with a clean name', async () => {
      seedServer(ADMIN);
      await openSettings('Channels');
      await fireEvent.press(await screen.findByLabelText('Create channel'));
      await fireEvent.press(screen.getByLabelText('Channel type: Voice'));
      await fireEvent.changeText(screen.getByLabelText('Channel name'), 'Game Night');
      await fireEvent.press(screen.getByLabelText('Category: Talk'));
      await fireEvent.press(screen.getByLabelText('Create'));
      await waitFor(() => expect(mockApi.createChannel).toHaveBeenCalledWith('g1', { name: 'game-night', type: ChannelType.GUILD_VOICE, parent_id: 'cat', delivery_mode: 'standard' }));
      await waitFor(() => expect(useGuildStore.getState().channels['newch']).toBeTruthy());
    });

    it('creates an ephemeral text channel', async () => {
      seedServer(ADMIN);
      await openSettings('Channels');
      await fireEvent.press(await screen.findByLabelText('Create channel'));
      await fireEvent.changeText(screen.getByLabelText('Channel name'), 'hush');
      await fireEvent.press(screen.getByLabelText('Delivery mode: Ephemeral E2EE'));
      await fireEvent.press(screen.getByLabelText('Create'));
      await waitFor(() => expect(mockApi.createChannel).toHaveBeenCalledWith('g1', expect.objectContaining({ name: 'hush', delivery_mode: 'ephemeral', parent_id: null })));
    });

    it('creates a category', async () => {
      seedServer(ADMIN);
      await openSettings('Channels');
      await fireEvent.press(await screen.findByLabelText('Create category'));
      expect(screen.queryByLabelText('Channel type: Text')).toBeNull();
      await fireEvent.changeText(screen.getByLabelText('Category name'), 'Games');
      await fireEvent.press(screen.getByLabelText('Create'));
      await waitFor(() => expect(mockApi.createChannel).toHaveBeenCalledWith('g1', { name: 'Games', type: ChannelType.GUILD_CATEGORY, parent_id: null, delivery_mode: 'standard' }));
    });

    it('renames a channel', async () => {
      seedServer(ADMIN);
      await openSettings('Channels');
      await fireEvent.press(await screen.findByLabelText('Edit general'));
      await fireEvent.changeText(await screen.findByLabelText('Channel name'), 'Main Chat');
      await fireEvent.press(screen.getByLabelText('Save name'));
      await waitFor(() => expect(mockApi.updateChannel).toHaveBeenCalledWith('general', { name: 'main-chat' }));
      await waitFor(() => expect(useGuildStore.getState().channels['general']?.name).toBe('main-chat'));
    });

    it('deletes a channel only after confirming', async () => {
      seedServer(ADMIN);
      await openSettings('Channels');
      await fireEvent.press(await screen.findByLabelText('Edit ideas'));
      await fireEvent.press(await screen.findByLabelText('Delete channel'));
      expect(await screen.findByText('Messages in this channel will be lost for everyone.')).toBeTruthy();
      expect(mockApi.deleteChannel).not.toHaveBeenCalled();
      await fireEvent.press(screen.getAllByLabelText('Delete channel')[0]!);
      await waitFor(() => expect(mockApi.deleteChannel).toHaveBeenCalledWith('ideas'));
      await waitFor(() => expect(useGuildStore.getState().channels['ideas']).toBeUndefined());
    });
  });
});
