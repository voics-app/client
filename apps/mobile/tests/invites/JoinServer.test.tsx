import { Alert } from 'react-native';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import type { Invite } from '@discordy/core/contracts/rest';
import { resetStores, seedServer } from '../support/server';

const invite = (extra: Partial<Invite> = {}) => ({ code: 'hTKzmak', guild: { id: 'g9', name: 'Chess Club', icon: null }, approximate_member_count: 12, approximate_presence_count: 3, ...extra }) as Invite;
const mockApi = {
  messages: jest.fn(async () => []),
  invite: jest.fn(async (_code: string) => invite()),
  acceptInvite: jest.fn(async (_code: string) => invite()),
};
const mockSession = { boot: jest.fn(), login: jest.fn(), loginMfa: jest.fn(), logout: jest.fn() };
jest.mock('../../src/runtime', () => ({ getRuntime: () => ({ session: mockSession, gateway: { state: 'idle', resumeNow: jest.fn(), send: jest.fn() }, api: mockApi, apiUrl: 'https://api.test' }) }));

async function openJoin() {
  seedServer(0n);
  await renderRouter('./app', { initialUrl: '/servers/g1' });
  await fireEvent.press(await screen.findByLabelText('Join a server'));
  await screen.findByLabelText('Invite link or code');
}

describe('join a server', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetStores();
  });

  it('has a Join a server button at the end of the rail', async () => {
    seedServer(0n);
    await renderRouter('./app', { initialUrl: '/' });
    expect(await screen.findByLabelText('Join a server')).toBeTruthy();
  });

  it('only continues with something that can be an invite code', async () => {
    await openJoin();
    expect(screen.getByLabelText('Continue').props.accessibilityState.disabled).toBe(true);
    await fireEvent.changeText(screen.getByLabelText('Invite link or code'), 'two words');
    expect(screen.getByLabelText('Continue').props.accessibilityState.disabled).toBe(true);
    await fireEvent.changeText(screen.getByLabelText('Invite link or code'), 'https://voics.app/invite/hTKzmak');
    expect(screen.getByLabelText('Continue').props.accessibilityState.disabled).toBe(false);
  });

  it('looks up a pasted link, shows the server and joins on accept, then opens it', async () => {
    await openJoin();
    await fireEvent.changeText(screen.getByLabelText('Invite link or code'), 'https://voics.app/invite/hTKzmak');
    await fireEvent.press(screen.getByLabelText('Continue'));
    expect(mockApi.invite).toHaveBeenCalledWith('hTKzmak');
    expect(await screen.findByText('Chess Club')).toBeTruthy();
    expect(screen.getByText('12 members, 3 online')).toBeTruthy();
    expect(mockApi.acceptInvite).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText('Accept invite'));
    expect(mockApi.acceptInvite).toHaveBeenCalledWith('hTKzmak');
    await waitFor(() => expect(useUiStore.getState().view).toMatchObject({ kind: 'guild', guildId: 'g9' }), { timeout: 2000 });
  });

  it('goes back to the code from the preview', async () => {
    await openJoin();
    await fireEvent.changeText(screen.getByLabelText('Invite link or code'), 'hTKzmak');
    await fireEvent.press(screen.getByLabelText('Continue'));
    await fireEvent.press(await screen.findByLabelText('Back'));
    expect(screen.getByLabelText('Invite link or code').props.value).toBe('hTKzmak');
  });

  it('shows why an invite is refused and stays on the form', async () => {
    mockApi.invite.mockRejectedValueOnce(new Error('Unknown Invite'));
    await openJoin();
    await fireEvent.changeText(screen.getByLabelText('Invite link or code'), 'deadbeef');
    await fireEvent.press(screen.getByLabelText('Continue'));
    expect(await screen.findByText('Unknown Invite')).toBeTruthy();
    expect(screen.getByLabelText('Invite link or code')).toBeTruthy();
  });

  it('opens a server you are already in without asking to accept', async () => {
    mockApi.invite.mockResolvedValueOnce(invite({ guild: { id: 'g1', name: 'Home Base' } }));
    await openJoin();
    await act(async () => useUiStore.getState().navigate({ kind: 'home', channelId: null }));
    await fireEvent.changeText(screen.getByLabelText('Invite link or code'), 'hTKzmak');
    await fireEvent.press(screen.getByLabelText('Continue'));
    await waitFor(() => expect(useUiStore.getState().view).toMatchObject({ kind: 'guild', guildId: 'g1' }));
    expect(mockApi.acceptInvite).not.toHaveBeenCalled();
    expect(useGuildStore.getState().guilds['g1']).toBeDefined();
  });

  it('tells you when accepting fails and keeps the preview', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockApi.acceptInvite.mockRejectedValueOnce(new Error('You are banned from this server'));
    await openJoin();
    await fireEvent.changeText(screen.getByLabelText('Invite link or code'), 'hTKzmak');
    await fireEvent.press(screen.getByLabelText('Continue'));
    await fireEvent.press(await screen.findByLabelText('Accept invite'));
    await waitFor(() => expect(alert).toHaveBeenCalledWith('Could not join the server', expect.stringContaining('banned')));
    expect(screen.getByLabelText('Accept invite')).toBeTruthy();
    await act(async () => undefined);
    alert.mockRestore();
  });
});
