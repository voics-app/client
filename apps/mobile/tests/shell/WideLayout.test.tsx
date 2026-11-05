import { Dimensions } from 'react-native';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useReadStateStore } from '@discordy/core/application/stores/peopleStores';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import { Permission } from '@discordy/core/contracts/permissions';
import { ChannelType, type GuildFull } from '@discordy/core/contracts/rest';
import { openChat } from '../../src/navigation/openChat';

const mockSession = { boot: jest.fn(), login: jest.fn(), loginMfa: jest.fn(), logout: jest.fn() };
const mockGateway = { state: 'idle', resumeNow: jest.fn() };
jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});
jest.mock('../../src/runtime', () => ({ getRuntime: () => ({ session: mockSession, gateway: mockGateway, api: { messages: jest.fn(async () => []) } }) }));

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
  channels: [channel('general', ChannelType.GUILD_TEXT, { position: 0 }), channel('random', ChannelType.GUILD_TEXT, { position: 1 })],
} as unknown as GuildFull;

const TABLET = { width: 820, height: 1180, scale: 2, fontScale: 1 };
const PHONE = { width: 390, height: 844, scale: 3, fontScale: 1 };
const setWindow = (size: typeof TABLET) => act(() => Dimensions.set({ window: size, screen: size }));

async function open(url: string) {
  useSessionStore.setState({ status: 'ready', user: ME as never });
  useGuildStore.getState().hydrate([guild], []);
  await renderRouter('./app', { initialUrl: url });
}

describe('tablet layout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSessionStore.getState().reset();
    useSessionStore.getState().setStatus('booting');
    useGuildStore.getState().reset();
    useReadStateStore.getState().hydrate([]);
    useUiStore.getState().navigate({ kind: 'home', channelId: null });
    mockSession.boot.mockImplementation(async () => {
      if (useSessionStore.getState().status === 'booting') useSessionStore.getState().setStatus('signedOut');
    });
  });
  afterEach(async () => {
    await setWindow(PHONE);
  });

  it('keeps the rail and the list on screen with a prompt in the chat pane', async () => {
    await setWindow(TABLET);
    await open('/');
    expect(await screen.findByTestId('wide-shell')).toBeTruthy();
    expect(screen.getByLabelText('Servers')).toBeTruthy();
    expect(screen.getByText('Direct messages')).toBeTruthy();
    expect(screen.getByTestId('chat-placeholder')).toBeTruthy();
    expect(screen.queryByTestId('main-screen')).toBeNull();
  });

  it('opens a channel beside the list instead of over it, and the next one replaces it', async () => {
    await setWindow(TABLET);
    await open('/');
    await fireEvent.press(await screen.findByLabelText('Home Base'));
    await fireEvent.press(await screen.findByLabelText('Open #general'));
    expect(screen).toHavePathname('/servers/g1/general');
    expect(await screen.findByText(/permission to send/)).toBeTruthy();
    expect(screen.getByLabelText('Servers')).toBeTruthy();
    expect(screen.getByLabelText('Open #random')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Open #random'));
    expect(screen).toHavePathname('/servers/g1/random');
    // Each chat replaced the one before, so the pane never builds up a stack to go back through.
    expect(router.canGoBack()).toBe(false);
  });

  it('returns to the last channel of a server from the rail', async () => {
    await setWindow(TABLET);
    await open('/servers/g1/general');
    await screen.findByText(/permission to send/);
    await act(async () => useUiStore.getState().navigate({ kind: 'home', channelId: null }));
    await fireEvent.press(screen.getByLabelText('Home Base'));
    expect(screen).toHavePathname('/servers/g1/general');
  });

  it('keeps a phone on one screen at a time', async () => {
    await open('/');
    expect(await screen.findByTestId('main-screen')).toBeTruthy();
    expect(screen.queryByTestId('wide-shell')).toBeNull();
    await fireEvent.press(await screen.findByLabelText('Home Base'));
    await fireEvent.press(await screen.findByLabelText('Open #general'));
    expect(screen).toHavePathname('/servers/g1/general');
    await act(async () => router.back());
    expect(screen).toHavePathname('/');
  });

  it('replaces on a tablet and pushes on a phone', async () => {
    await open('/');
    const push = jest.spyOn(router, 'push').mockImplementation(() => undefined);
    const replace = jest.spyOn(router, 'replace').mockImplementation(() => undefined);
    openChat({ guildId: 'g1', channelId: 'general' });
    expect(push).toHaveBeenCalledWith('/servers/g1/general');
    await setWindow(TABLET);
    openChat({ channelId: 'dm1' });
    expect(replace).toHaveBeenCalledWith('/dms/dm1');
    push.mockRestore();
    replace.mockRestore();
  });
});
