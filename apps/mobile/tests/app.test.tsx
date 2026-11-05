import { Alert } from 'react-native';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useReadStateStore } from '@discordy/core/application/stores/peopleStores';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import { Permission } from '@discordy/core/contracts/permissions';
import { ChannelType, type GuildFull } from '@discordy/core/contracts/rest';
import { MODE_COPY } from '@discordy/core/domain/deliveryMode';
import { BRAND } from '../src/brand';

const mockSession = { boot: jest.fn(), login: jest.fn(), loginMfa: jest.fn(), logout: jest.fn() };
const mockGateway = { state: 'idle', resumeNow: jest.fn() };
// The icon font is native; a stand-in renders the glyph name.
jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});
jest.mock('../src/runtime', () => ({ getRuntime: () => ({ session: mockSession, gateway: mockGateway, api: { messages: jest.fn(async () => []) } }) }));

const ME = { id: 'u1', username: 'me', global_name: 'Me Myself', discriminator: '0', avatar: null };
const everyone = { id: 'g1', name: '@everyone', color: 0, hoist: false, position: 0, permissions: String(Permission.VIEW_CHANNEL), managed: false, mentionable: false };
const channel = (id: string, type: number, extra: object = {}) => ({ id, type, guild_id: 'g1', name: id, position: 0, delivery_mode: 'standard', ...extra });
const guild = {
  id: 'g1',
  name: 'Home Base',
  icon: null,
  owner_id: 'owner',
  roles: [everyone],
  emojis: [],
  members: [{ user: ME, roles: [] }],
  channels: [channel('cat', ChannelType.GUILD_CATEGORY), channel('general', ChannelType.GUILD_TEXT, { parent_id: 'cat' }), channel('lobby', ChannelType.GUILD_VOICE)],
} as unknown as GuildFull;

function signIn() {
  useSessionStore.setState({ status: 'ready', user: ME as never });
  useGuildStore.getState().hydrate([guild], []);
}

const selected = (label: string) => screen.getByLabelText(label).props.accessibilityState.selected;

async function openApp(url = '/') {
  signIn();
  await renderRouter('./app', { initialUrl: url });
  // A chat covers the main screen, which then drops out of the accessibility tree.
  await (url === '/servers/g1/general' ? screen.findByText(/permission to send/) : screen.findByLabelText('Direct messages'));
}

describe('app shell', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSessionStore.getState().reset();
    useSessionStore.getState().setStatus('booting');
    useGuildStore.getState().reset();
    useReadStateStore.getState().hydrate([]);
    useUiStore.getState().navigate({ kind: 'home', channelId: null });
    // Like the real session manager: boot decides between signed out and signed in.
    mockSession.boot.mockImplementation(async () => {
      if (useSessionStore.getState().status === 'booting') useSessionStore.getState().setStatus('signedOut');
    });
  });

  it('boots the session and opens on sign-in with the brand name when signed out', async () => {
    await renderRouter('./app', { initialUrl: '/' });
    expect(await screen.findByLabelText('Email')).toBeTruthy();
    expect(screen.getByText(BRAND.displayName)).toBeTruthy();
    expect(mockSession.boot).toHaveBeenCalledTimes(1);
  });

  it('renders copy from @discordy/core with the installed brand', () => {
    expect(MODE_COPY.standard.description).toContain(BRAND.displayName);
  });

  it('sends a signed-out deep link to a channel to sign-in', async () => {
    await renderRouter('./app', { initialUrl: '/servers/g1/general' });
    expect(await screen.findByLabelText('Email')).toBeTruthy();
  });

  it('has no bottom tab bar: the main screen is the rail beside the DM list', async () => {
    await openApp();
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.getByLabelText('Servers')).toBeTruthy();
    expect(screen.getByText('Direct messages')).toBeTruthy();
    expect(screen.getByLabelText('Account and status')).toBeTruthy();
    expect(screen.queryByText('Servers')).toBeNull();
  });

  it('puts Direct messages first on the rail, selected, with the servers after it', async () => {
    await openApp();
    expect(selected('Direct messages')).toBe(true);
    expect(selected('Home Base')).toBe(false);
    expect(screen.getAllByTestId('rail-pill')).toHaveLength(1);
  });

  it('selects a server on the rail and lists its channels by category beside it', async () => {
    await openApp();
    await fireEvent.press(screen.getByLabelText('Home Base'));
    expect(await screen.findByText('general')).toBeTruthy();
    expect(screen.getByText('CAT')).toBeTruthy();
    expect(screen.getByText('lobby')).toBeTruthy();
    expect(selected('Home Base')).toBe(true);
    expect(selected('Direct messages')).toBe(false);
    expect(screen.getAllByTestId('rail-pill')).toHaveLength(1);
    await fireEvent.press(screen.getByLabelText('Direct messages'));
    expect(await screen.findByText('No conversations yet.')).toBeTruthy();
    expect(screen.queryByText('general')).toBeNull();
  });

  it('collapses a category from its header', async () => {
    await openApp();
    await fireEvent.press(screen.getByLabelText('Home Base'));
    await fireEvent.press(await screen.findByLabelText('cat category'));
    expect(screen.queryByText('general')).toBeNull();
    await fireEvent.press(screen.getByLabelText('cat category'));
    expect(await screen.findByText('general')).toBeTruthy();
  });

  it('opens a channel full screen over the rail and returns to the rail on back', async () => {
    await openApp();
    await fireEvent.press(screen.getByLabelText('Home Base'));
    await fireEvent.press(await screen.findByLabelText('Open #general'));
    expect(screen).toHavePathname('/servers/g1/general');
    await act(async () => router.back());
    expect(screen).toHavePathname('/');
    expect(await screen.findByLabelText('Open #general')).toBeTruthy();
    expect(selected('Home Base')).toBe(true);
  });

  it('opens a deep link to a channel, with the server selected and the main screen underneath', async () => {
    await openApp('/servers/g1/general');
    expect(screen).toHavePathname('/servers/g1/general');
    expect(useUiStore.getState().view).toEqual({ kind: 'guild', guildId: 'g1', channelId: 'general' });
    await act(async () => router.back());
    expect(screen).toHavePathname('/');
    expect(selected('Home Base')).toBe(true);
    expect(selected('Open #general')).toBe(true);
  });

  it('opens a deep link to a server with that server selected', async () => {
    await openApp('/servers/g1');
    expect(await screen.findByText('general')).toBeTruthy();
    expect(selected('Home Base')).toBe(true);
  });

  it('lights the rail pip and badge for unread mentions, and the pip gives way to the pill when selected', async () => {
    signIn();
    useGuildStore.getState().upsertChannel({ ...channel('general', ChannelType.GUILD_TEXT, { parent_id: 'cat' }), last_message_id: '500' } as never);
    useReadStateStore.getState().setPosition('general', '100', 3);
    await renderRouter('./app', { initialUrl: '/' });
    await screen.findByLabelText('Direct messages');
    expect(screen.getByTestId('rail-pip')).toBeTruthy();
    expect(screen.getByLabelText('3 mentions')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Home Base'));
    expect(await screen.findByTestId('channel-unread')).toBeTruthy();
    expect(screen.queryByTestId('rail-pip')).toBeNull();
  });

  it('shows folders on the rail and collapses them', async () => {
    signIn();
    useGuildStore.getState().setRail([{ id: 7, name: 'Friends', color: null, guild_ids: ['g1'] }] as never);
    await renderRouter('./app', { initialUrl: '/' });
    const folder = await screen.findByLabelText('Friends folder');
    expect(screen.getByLabelText('Home Base')).toBeTruthy();
    await fireEvent.press(folder);
    expect(screen.queryByLabelText('Home Base')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Friends folder'));
    expect(await screen.findByLabelText('Home Base')).toBeTruthy();
  });

  it('reaches notifications from the bell in the column header', async () => {
    await openApp();
    await fireEvent.press(screen.getByLabelText('Notifications'));
    expect(screen).toHavePathname('/notifications');
    expect(await screen.findByText(/No recent mentions/)).toBeTruthy();
  });

  it('shows the signed-in user in the user panel', async () => {
    await openApp();
    expect(screen.getByText('Me Myself')).toBeTruthy();
    expect(screen.getByText('Online')).toBeTruthy();
  });

  it('reaches the user settings from the user panel, and logs out there after confirming', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await openApp();
    await fireEvent.press(screen.getByLabelText('Account and status'));
    expect(screen).toHavePathname('/settings');
    expect(await screen.findByLabelText('Search settings')).toBeTruthy();
    await act(async () => router.back());
    await fireEvent.press(screen.getByLabelText('User settings'));
    expect(screen).toHavePathname('/settings');
    await fireEvent.press(await screen.findByLabelText('Log out'));
    expect(mockSession.logout).not.toHaveBeenCalled();
    expect(alert.mock.calls[0]![0]).toBe('Log out?');
    await act(async () => alert.mock.calls[0]![2]!.find((b) => b.style === 'destructive')!.onPress!());
    expect(mockSession.logout).toHaveBeenCalledTimes(1);
    alert.mockRestore();
  });

  it('returns to sign-in when the session ends', async () => {
    await openApp();
    await act(async () => useSessionStore.getState().reset());
    expect(await screen.findByLabelText('Email')).toBeTruthy();
  });
});
