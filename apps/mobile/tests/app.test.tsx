import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { Permission } from '@discordy/core/contracts/permissions';
import { ChannelType, type GuildFull } from '@discordy/core/contracts/rest';
import { MODE_COPY } from '@discordy/core/domain/deliveryMode';
import { BRAND } from '../src/brand';

const mockSession = { boot: jest.fn(), login: jest.fn(), loginMfa: jest.fn(), logout: jest.fn() };
const mockGateway = { state: 'idle', resumeNow: jest.fn() };
// The icon font is native; a stand-in renders the glyph name so the test can tell the tabs apart.
jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});
jest.mock('../src/runtime', () => ({ getRuntime: () => ({ session: mockSession, gateway: mockGateway }) }));

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

describe('app shell', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSessionStore.getState().reset();
    useSessionStore.getState().setStatus('booting');
    useGuildStore.getState().reset();
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

  it('shows the four tabs once signed in', async () => {
    signIn();
    await renderRouter('./app', { initialUrl: '/' });
    for (const title of ['Servers', 'DMs', 'Notifications', 'You']) {
      expect((await screen.findAllByText(title)).length).toBeGreaterThan(0);
    }
  });

  it('hides the tab header on Servers and DMs, whose nested stack draws its own', async () => {
    signIn();
    await renderRouter('./app', { initialUrl: '/' });
    await screen.findAllByText('Servers');
    // Under Jest the native stack header is not rendered, so only a leftover tab header could add a second 'Servers' or 'DMs'.
    expect(screen.getAllByText('Servers')).toHaveLength(1);
    expect(screen.getAllByText('DMs')).toHaveLength(1);
  });

  it('gives every tab its own icon', async () => {
    signIn();
    await renderRouter('./app', { initialUrl: '/' });
    await screen.findAllByText('Servers');
    // Each tab renders its outline and filled glyph; strip the suffix to count distinct icons.
    const shapes = screen.getAllByText(/^icon:/).map((n) => (n.props.children as string).replace(/-outline$/, ''));
    expect([...new Set(shapes)].sort()).toEqual(['icon:chatbubbles', 'icon:mail', 'icon:notifications', 'icon:person']);
  });

  it('lists the servers from the store and opens a server channel list', async () => {
    signIn();
    await renderRouter('./app', { initialUrl: '/' });
    await screen.findAllByText('Servers');
    await fireEvent.press(await screen.findByText('Home Base'));
    expect(await screen.findByText('general')).toBeTruthy();
    expect(screen.getByText('CAT')).toBeTruthy();
    expect(screen.queryByText('lobby')).toBeNull();
  });

  it('signs out from the You tab', async () => {
    signIn();
    await renderRouter('./app', { initialUrl: '/' });
    await fireEvent.press((await screen.findAllByText('You'))[0]!);
    expect(await screen.findByText('Me Myself')).toBeTruthy();
    await fireEvent.press(screen.getByText('Sign out'));
    expect(mockSession.logout).toHaveBeenCalledTimes(1);
  });

  it('returns to sign-in when the session ends', async () => {
    signIn();
    await renderRouter('./app', { initialUrl: '/' });
    await screen.findAllByText('Servers');
    await act(async () => useSessionStore.getState().reset());
    expect(await screen.findByLabelText('Email')).toBeTruthy();
  });
});
