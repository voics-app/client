import { Alert } from 'react-native';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { DEFAULT_PREFS, usePrefsStore } from '@discordy/core/application/stores/prefsStore';
import { useRelationshipStore } from '@discordy/core/application/stores/peopleStores';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { usePushPrefs, usePushStatus } from '../../src/notifications/push/pushStore';
import { RelationshipType, type AuthSession, type Relationship, type User } from '@discordy/core/contracts/rest';

const ME: User = { id: 'u1', username: 'me', global_name: 'Me Myself', avatar: null, email: 'me@example.test', bio: 'hello', verified: true, mfa_enabled: false };
const PAT: User = { id: 'u2', username: 'pat', global_name: 'Pat', avatar: null };

const session = (id: string, extra: Partial<AuthSession> = {}): AuthSession => ({ id, client: 'Voics', os: 'iOS', device_name: 'Phone', location: null, current: false, last_used_at: new Date().toISOString(), ...extra }) as AuthSession;

const mockApi = {
  me: jest.fn(async () => ME),
  changeAccount: jest.fn(async (_change: object) => ME),
  enableTotp: jest.fn(async (_password: string) => ({ secret: 'ABCDEFGHIJKLMNOP', otpauth_uri: 'otpauth://totp/Voics:me?secret=ABCDEFGHIJKLMNOP' })),
  verifyTotp: jest.fn(async (_code: string) => [{ code: 'aaaaa-bbbbb', consumed: false }]),
  disableTotp: jest.fn(async (_password: string, _code: string) => undefined),
  deleteAccount: jest.fn(async (_password: string) => undefined),
  disableAccount: jest.fn(async (_password: string) => undefined),
  updateMe: jest.fn(async (patch: object) => ({ ...ME, ...patch })),
  updateSettings: jest.fn(async (patch: object) => ({ default_delivery_mode: 'standard', ...patch })),
  setChannelDeliveryOverride: jest.fn(async (_id: string, _mode: string | null) => undefined),
  deleteRelationship: jest.fn(async (_id: string) => undefined),
  listSessions: jest.fn(async (): Promise<AuthSession[]> => [session('s1', { current: true, os: 'iOS' }), session('s2', { client: 'Firefox', os: 'Windows' })]),
  revokeSession: jest.fn(async (_id: string) => undefined),
  logoutOtherSessions: jest.fn(async () => undefined),
  listUserDevices: jest.fn(async (_id: string) => [{ device_id: 'd1', identity_key_b64: 'k'.repeat(40) }]),
};
const mockSession = { boot: jest.fn(), login: jest.fn(), loginMfa: jest.fn(), logout: jest.fn(async () => undefined) };
const mockGateway = { state: 'idle', resumeNow: jest.fn(), send: jest.fn() };
// These tests run the app as Expo Go does: no native modules, so push is off until a test says otherwise.
jest.mock('../../src/native/isNativeBuild', () => ({ isNativeBuild: false }));
jest.mock('../../src/runtime', () => ({ getRuntime: () => ({ session: mockSession, gateway: mockGateway, api: mockApi, apiUrl: 'https://api.test' }) }));

const alertButtons = (alert: jest.SpyInstance) => alert.mock.calls.at(-1)![2]!;

async function open(path: string) {
  await renderRouter('./app', { initialUrl: path });
}

describe('settings', () => {
  let alert: jest.SpyInstance;
  beforeEach(() => {
    jest.clearAllMocks();
    alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    useSessionStore.getState().reset();
    useGuildStore.getState().reset();
    useRelationshipStore.getState().hydrate([]);
    usePrefsStore.setState(DEFAULT_PREFS);
    usePushStatus.getState().setStatus('unavailable');
    usePushPrefs.setState({ offered: false, previews: true });
    useSessionStore.setState({ status: 'ready', user: ME as never, settings: { default_delivery_mode: 'standard' } });
  });
  afterEach(() => alert.mockRestore());

  describe('the list', () => {
    it('shows the pages in two groups, with Log out', async () => {
      await open('/settings');
      for (const label of ['Profile', 'Privacy and delivery', 'Devices and sessions', 'Appearance', 'Accessibility', 'Notifications', 'Chat', 'Log out']) expect(await screen.findByLabelText(label)).toBeTruthy();
      expect(screen.getByText('User settings')).toBeTruthy();
      expect(screen.getByText('App settings')).toBeTruthy();
    });

    it('opens a page', async () => {
      await open('/settings');
      await fireEvent.press(await screen.findByLabelText('Chat'));
      expect(screen).toHavePathname('/settings/chat');
      expect(await screen.findByLabelText('Show reactions')).toBeTruthy();
    });

    it('searches rows, and opens the page with the row marked', async () => {
      await open('/settings');
      await fireEvent.changeText(await screen.findByLabelText('Search settings'), 'reduce');
      await fireEvent.press(await screen.findByLabelText('Reduce motion, Accessibility'));
      expect(screen).toHavePathname('/settings/accessibility');
      expect(screen.getByTestId('row-reduce-motion').props.style).toEqual(expect.arrayContaining([expect.objectContaining({ backgroundColor: expect.stringContaining('rgba') })]));
    });

    it('says when nothing matches', async () => {
      await open('/settings');
      await fireEvent.changeText(await screen.findByLabelText('Search settings'), 'zzzz');
      expect(await screen.findByText('No settings match "zzzz".')).toBeTruthy();
    });

    it('asks before logging out', async () => {
      await open('/settings');
      await fireEvent.press(await screen.findByLabelText('Log out'));
      expect(mockSession.logout).not.toHaveBeenCalled();
      await act(async () => alertButtons(alert).find((b: { style?: string }) => b.style === 'destructive').onPress());
      expect(mockSession.logout).toHaveBeenCalledTimes(1);
    });

    it('tells an unknown page apart', async () => {
      await open('/settings/keybinds');
      expect(await screen.findByText('This settings page does not exist.')).toBeTruthy();
    });
  });

  describe('my account', () => {
    it('changes the password only with matching passwords and the current password', async () => {
      await open('/settings/account');
      await fireEvent.press(await screen.findByLabelText('Change'));
      await fireEvent.changeText(await screen.findByLabelText('New password'), 'long enough 1');
      await fireEvent.changeText(screen.getByLabelText('Confirm new password'), 'another one 22');
      await fireEvent.changeText(screen.getByLabelText('Current password'), 'old');
      await fireEvent.press(screen.getAllByLabelText('Change password').at(-1)!);
      expect(await screen.findByText('The passwords do not match.')).toBeTruthy();
      expect(mockApi.changeAccount).not.toHaveBeenCalled();
      await fireEvent.changeText(screen.getByLabelText('Confirm new password'), 'long enough 1');
      await fireEvent.press(screen.getAllByLabelText('Change password').at(-1)!);
      await waitFor(() => expect(mockApi.changeAccount).toHaveBeenCalledWith({ new_password: 'long enough 1', password: 'old' }));
    });

    it('shows the server message when the password is wrong and keeps the sheet open', async () => {
      mockApi.changeAccount.mockRejectedValueOnce(Object.assign(new Error('bad'), { errors: { username: { _errors: [{ message: 'Wrong password' }] } } }));
      await open('/settings/account');
      await fireEvent.press((await screen.findAllByLabelText('Edit'))[0]!);
      await fireEvent.changeText(await screen.findByLabelText('New username'), 'newname');
      await fireEvent.changeText(screen.getByLabelText('Current password'), 'nope');
      await fireEvent.press(screen.getByLabelText('Save username'));
      expect(await screen.findByText('Wrong password')).toBeTruthy();
      expect(screen.getByLabelText('New username')).toBeTruthy();
    });

    it('sets up two-factor: password, then key and code, then backup codes', async () => {
      await open('/settings/account');
      await fireEvent.press(await screen.findByLabelText('Turn on'));
      await fireEvent.changeText(await screen.findByLabelText('Current password'), 'pw');
      await fireEvent.press(screen.getByLabelText('Continue'));
      await waitFor(() => expect(mockApi.enableTotp).toHaveBeenCalledWith('pw'));
      expect(await screen.findByText('ABCD EFGH IJKL MNOP')).toBeTruthy();
      expect(screen.getAllByLabelText('Turn on').at(-1)!.props.accessibilityState.disabled).toBe(true);
      await fireEvent.changeText(screen.getByLabelText('6-digit code'), '123456');
      await fireEvent.press(screen.getAllByLabelText('Turn on').at(-1)!);
      await waitFor(() => expect(mockApi.verifyTotp).toHaveBeenCalledWith('123456'));
      expect(await screen.findByText('aaaaa-bbbbb')).toBeTruthy();
    });

    it('turns two-factor off only with the password and a code', async () => {
      useSessionStore.setState({ user: { ...ME, mfa_enabled: true } as never });
      mockApi.me.mockResolvedValue({ ...ME, mfa_enabled: true });
      await open('/settings/account');
      await fireEvent.press(await screen.findByLabelText('Turn off'));
      await fireEvent.changeText(await screen.findByLabelText('Current password'), 'pw');
      expect(screen.getAllByLabelText('Turn off').at(-1)!.props.accessibilityState.disabled).toBe(true);
      await fireEvent.changeText(screen.getByLabelText('Authenticator or backup code'), '123456');
      await fireEvent.press(screen.getAllByLabelText('Turn off').at(-1)!);
      await waitFor(() => expect(mockApi.disableTotp).toHaveBeenCalledWith('pw', '123456'));
      mockApi.me.mockResolvedValue(ME);
    });

    it('deletes the account only after the username is typed back and the password given, then logs out', async () => {
      await open('/settings/account');
      await fireEvent.press(await screen.findByLabelText('Delete'));
      await fireEvent.changeText(await screen.findByLabelText('Current password'), 'pw');
      expect(screen.getByLabelText('Delete account').props.accessibilityState.disabled).toBe(true);
      await fireEvent.changeText(screen.getByLabelText('Type me to confirm'), 'ME');
      await fireEvent.press(screen.getByLabelText('Delete account'));
      await waitFor(() => expect(mockApi.deleteAccount).toHaveBeenCalledWith('pw'));
      await waitFor(() => expect(mockSession.logout).toHaveBeenCalled());
    });

    it('offers verification while the email is unverified', async () => {
      useSessionStore.setState({ user: { ...ME, verified: false } as never });
      mockApi.me.mockResolvedValue({ ...ME, verified: false });
      await open('/settings/account');
      expect(await screen.findByText('Verify me@example.test')).toBeTruthy();
      mockApi.me.mockResolvedValue(ME);
    });
  });

  describe('profile', () => {
    it('saves only the changed fields', async () => {
      await open('/settings/profile');
      expect(screen.getByLabelText('Save changes').props.accessibilityState.disabled).toBe(true);
      await fireEvent.changeText(await screen.findByLabelText('About me'), 'a new bio');
      await fireEvent.press(screen.getByLabelText('Save changes'));
      await waitFor(() => expect(mockApi.updateMe).toHaveBeenCalledWith({ bio: 'a new bio' }));
      expect(useSessionStore.getState().user?.bio).toBe('a new bio');
    });

    it('sets the status at once, publishes it and saves it to the account', async () => {
      await open('/settings/profile');
      await fireEvent.press(await screen.findByLabelText('Status: Do not disturb'));
      expect(useSessionStore.getState().settings.status).toBe('dnd');
      expect(mockGateway.send).toHaveBeenCalledWith(3, expect.objectContaining({ status: 'dnd' }));
      await waitFor(() => expect(mockApi.updateSettings).toHaveBeenCalledWith({ status: 'dnd' }));
    });

    it('saves a custom status with its expiry and clears it', async () => {
      await open('/settings/profile');
      await fireEvent.changeText(await screen.findByLabelText('Custom status'), 'at lunch');
      await fireEvent.press(screen.getByLabelText('Clear after: 1 hour'));
      await fireEvent.press(screen.getByLabelText('Save status'));
      await waitFor(() => expect(mockApi.updateSettings).toHaveBeenCalledWith({ custom_status: expect.objectContaining({ text: 'at lunch', expires_at: expect.any(String) }) }));
      await fireEvent.press(await screen.findByLabelText('Clear status'));
      await waitFor(() => expect(mockApi.updateSettings).toHaveBeenLastCalledWith({ custom_status: null }));
    });
  });

  describe('privacy', () => {
    it('keeps the encrypted modes switched off and says why', async () => {
      await open('/settings/privacy');
      expect((await screen.findByLabelText('Ephemeral E2EE')).props.accessibilityState.disabled).toBe(true);
      expect(screen.getByLabelText('Standard').props.accessibilityState.selected).toBe(true);
      expect(screen.getByText(/Encrypted modes are not available in the mobile app yet/)).toBeTruthy();
    });

    it('turns on end-to-end encryption for all my calls and saves it to the account', async () => {
      await open('/settings/privacy');
      const toggle = await screen.findByLabelText('Encrypt all my calls end-to-end');
      expect(toggle.props.disabled).toBe(false);
      await fireEvent(toggle, 'valueChange', true);
      await waitFor(() => expect(mockApi.updateSettings).toHaveBeenCalledWith({ e2ee_calls_default: true }));
    });

    it('lists blocked people and unblocks after a question', async () => {
      useRelationshipStore.getState().hydrate([{ id: 'u2', type: RelationshipType.BLOCKED, user: PAT } as Relationship]);
      await open('/settings/privacy');
      await fireEvent.press(await screen.findByLabelText('Unblock'));
      expect(mockApi.deleteRelationship).not.toHaveBeenCalled();
      await act(async () => alertButtons(alert).find((b: { style?: string }) => b.style === 'destructive').onPress());
      expect(mockApi.deleteRelationship).toHaveBeenCalledWith('u2');
    });

    it('clears a per-chat override', async () => {
      useSessionStore.setState({ settings: { default_delivery_mode: 'standard', delivery_overrides: { c1: 'ephemeral' } } });
      await open('/settings/privacy');
      await fireEvent.press(await screen.findByLabelText('Clear'));
      await waitFor(() => expect(mockApi.setChannelDeliveryOverride).toHaveBeenCalledWith('c1', null));
      expect(useSessionStore.getState().settings.delivery_overrides).toEqual({});
    });
  });

  describe('devices and sessions', () => {
    it('lists the sessions with this device first and logs out another one', async () => {
      await open('/settings/devices');
      expect(await screen.findByText('Voics on iOS (this device)')).toBeTruthy();
      await fireEvent.press(screen.getByLabelText('Log out Firefox on Windows'));
      await waitFor(() => expect(mockApi.revokeSession).toHaveBeenCalledWith('s2'));
    });

    it('logs out all other devices only after confirming', async () => {
      await open('/settings/devices');
      await fireEvent.press(await screen.findByLabelText('Log out all'));
      expect(mockApi.logoutOtherSessions).not.toHaveBeenCalled();
      await act(async () => alertButtons(alert).find((b: { style?: string }) => b.style === 'destructive').onPress());
      expect(mockApi.logoutOtherSessions).toHaveBeenCalled();
    });

    it('offers no log out of the current device or of all when it is the only one', async () => {
      mockApi.listSessions.mockResolvedValueOnce([session('s1', { current: true })]);
      await open('/settings/devices');
      expect(await screen.findByText('Voics on iOS (this device)')).toBeTruthy();
      expect(screen.queryByLabelText('Log out all')).toBeNull();
    });
  });

  describe('appearance and accessibility', () => {
    it('chooses a theme and accent, and says they apply from the next start', async () => {
      await open('/settings/appearance');
      expect(screen.queryByText(/next time Voics starts/)).toBeNull();
      expect(screen.getAllByText('Takes effect after you restart Voics.')).toHaveLength(2);
      await fireEvent.press(await screen.findByLabelText('Light'));
      expect(usePrefsStore.getState().theme).toBe('light');
      expect(await screen.findByText(/next time Voics starts/)).toBeTruthy();
      await fireEvent.press(screen.getByLabelText('Rose'));
      expect(usePrefsStore.getState().accent).toBe('rose');
    });

    it('steps the text size within the desktop range', async () => {
      await open('/settings/appearance');
      await fireEvent.press(await screen.findByLabelText('Increase Text size'));
      expect(usePrefsStore.getState().fontScale).toBeCloseTo(1.05);
      usePrefsStore.getState().set('fontScale', 1.3);
      await waitFor(() => expect(screen.getByLabelText('Increase Text size').props.accessibilityState?.disabled ?? screen.getByLabelText('Increase Text size').props.disabled).toBeTruthy());
    });

    it('turns reduce motion and link underlines on and picks how role colours show', async () => {
      await open('/settings/accessibility');
      await fireEvent(await screen.findByLabelText('Reduce motion'), 'valueChange', true);
      expect(usePrefsStore.getState().reduceMotion).toBe(true);
      await fireEvent(screen.getByLabelText('Always underline links'), 'valueChange', true);
      expect(usePrefsStore.getState().linkUnderline).toBe(true);
      await fireEvent.press(screen.getByLabelText('Role colours: As a dot'));
      expect(usePrefsStore.getState().roleColors).toBe('dot');
    });
  });

  describe('notifications and chat', () => {
    it('toggles only mentions', async () => {
      await open('/settings/notifications');
      await fireEvent(await screen.findByLabelText('Only mentions'), 'valueChange', true);
      expect(usePrefsStore.getState().notifyOnlyMentions).toBe(true);
    });

    it('toggles the chat display options', async () => {
      await open('/settings/chat');
      await fireEvent(await screen.findByLabelText('Display images and videos'), 'valueChange', false);
      await fireEvent(screen.getByLabelText('Convert emoticons'), 'valueChange', false);
      await fireEvent.press(screen.getByLabelText('Show spoiler content: Always'));
      expect(usePrefsStore.getState()).toMatchObject({ inlineMedia: false, convertEmoticons: false, spoilerDisplay: 'always' });
    });

    it('shows push as unavailable in Expo Go and keeps its switches off', async () => {
      await open('/settings/notifications');
      expect(await screen.findByText('Not available in Expo Go')).toBeTruthy();
      expect(screen.getByLabelText("Show message previews").props.disabled).toBe(true);
      expect(screen.queryByLabelText('Turn on')).toBeNull();
    });

    it('turns push on from the page, keeps the previews choice and sends a refused person to iOS Settings', async () => {
      await open('/settings/notifications');
      act(() => usePushStatus.getState().setStatus('undetermined'));
      expect(await screen.findByLabelText('Turn on')).toBeTruthy();
      await fireEvent(screen.getByLabelText('Show message previews'), 'valueChange', false);
      expect(usePushPrefs.getState().previews).toBe(false);
      act(() => usePushStatus.getState().setStatus('denied'));
      expect(await screen.findByLabelText('Open Settings')).toBeTruthy();
      act(() => usePushStatus.getState().setStatus('granted'));
      expect(await screen.findByText('On')).toBeTruthy();
    });
  });
});
