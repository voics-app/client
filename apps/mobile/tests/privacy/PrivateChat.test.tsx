import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { renderRouter } from 'expo-router/testing-library';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useMessageStore } from '@discordy/core/application/stores/messageStore';
import { usePrivacyStore } from '@discordy/core/application/stores/privacyStore';
import { useReadStateStore } from '@discordy/core/application/stores/peopleStores';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { Permission } from '@discordy/core/contracts/permissions';
import { ChannelType, type Channel, type GuildFull, type Message } from '@discordy/core/contracts/rest';
import { messageCache } from '../../src/offline/messageCache';
import { SafetyNumberSheet } from '../../src/privacy/SafetyNumberSheet';

const mockApi = {
  messages: jest.fn(async (): Promise<Message[]> => []),
  ack: jest.fn(async (): Promise<void> => undefined),
  sendMessage: jest.fn(),
  listUserDevices: jest.fn(async (_userId: string) => [{ device_id: 'd9' }]),
};
const mockSender = {
  resolveMode: jest.fn((channel: Channel) => channel.delivery_mode ?? 'standard'),
  loadHistory: jest.fn(async (_channel: Channel, _before?: string): Promise<void> => undefined),
  send: jest.fn(async (_channel: Channel, _input: { content: string }): Promise<unknown> => ({})),
};
const mockPrivacy = { sender: mockSender, p2p: { safetyNumber: jest.fn(async (_user: string, _device: string) => ['11111', '22222', '33333']) } };
jest.mock('../../src/runtime', () => ({
  getRuntime: () => ({ session: { boot: jest.fn() }, gateway: { state: 'idle', resumeNow: jest.fn() }, api: mockApi, privacy: mockPrivacy }),
}));

const ME = { id: 'u1', username: 'me', global_name: 'Me', discriminator: '0', avatar: null };
const BASIC = Permission.VIEW_CHANNEL | Permission.SEND_MESSAGES | Permission.READ_MESSAGE_HISTORY | Permission.ADD_REACTIONS | Permission.ATTACH_FILES;

function stored(n: number, content: string): Message {
  return {
    id: String(1000000 + n),
    channel_id: 'general',
    guild_id: 'g1',
    author: ME,
    content,
    timestamp: new Date().toISOString(),
    edited_timestamp: null,
    mention_everyone: false,
    mentions: [],
    mention_roles: [],
    attachments: [],
    embeds: [],
    pinned: false,
    type: 0,
  } as Message;
}

function guild(deliveryMode: string): GuildFull {
  const everyone = { id: 'g1', name: '@everyone', color: 0, hoist: false, position: 0, permissions: String(BASIC), managed: false, mentionable: false };
  return {
    id: 'g1',
    name: 'Home Base',
    icon: null,
    owner_id: 'owner',
    roles: [everyone],
    emojis: [],
    members: [{ user: ME, roles: [] }],
    channels: [{ id: 'general', type: ChannelType.GUILD_TEXT, guild_id: 'g1', name: 'general', position: 0, delivery_mode: deliveryMode }],
  } as unknown as GuildFull;
}

async function open(deliveryMode: string) {
  useSessionStore.setState({ status: 'ready', user: ME as never });
  useGuildStore.getState().hydrate([guild(deliveryMode)], []);
  await renderRouter('./app', { initialUrl: '/servers/g1' });
  await fireEvent.press(await screen.findByLabelText('Open #general'));
}

describe('Ephemeral and P2P chats in a native build', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSessionStore.getState().reset();
    useGuildStore.getState().reset();
    useMessageStore.getState().reset();
    usePrivacyStore.setState({ p2p: {}, groups: {} });
    useReadStateStore.getState().reset();
    messageCache.clear();
    mockSender.loadHistory.mockImplementation(async (channel) => {
      useMessageStore.getState().setHistory(channel.id, [stored(1, 'secret hello')], { prepend: false, hasMoreBefore: false });
    });
  });

  it('opens an ephemeral channel as a chat, reads it from the local store and never asks the server for history', async () => {
    await open('ephemeral');
    expect(await screen.findByText('secret hello')).toBeTruthy();
    expect(mockSender.loadHistory).toHaveBeenCalledTimes(1);
    expect(mockApi.messages).not.toHaveBeenCalled();
    expect(screen.queryByText(/not in this test version/)).toBeNull();
    expect(screen.getByLabelText(/^Delivery mode: Ephemeral E2EE\./)).toBeTruthy();
    expect(screen.getByLabelText('Message')).toBeTruthy();
  });

  it('keeps private messages out of the plain message cache', async () => {
    await open('ephemeral');
    await screen.findByText('secret hello');
    expect(messageCache.load('general')).toEqual([]);
  });

  it('sends text through the private sender, not the server API, and offers no attachments', async () => {
    await open('ephemeral');
    await screen.findByText('secret hello');
    await fireEvent.changeText(screen.getByLabelText('Message'), 'second secret');
    await fireEvent.press(screen.getByLabelText('Send'));
    await waitFor(() => expect(mockSender.send).toHaveBeenCalledTimes(1));
    expect(mockSender.send.mock.calls[0]?.[1]).toEqual({ content: 'second secret' });
    expect(mockApi.sendMessage).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Attach')).toBeNull();
  });

  it('marks a message that could not be delivered as failed, with the reason', async () => {
    mockSender.send.mockRejectedValueOnce(new Error('Peer offline.'));
    await open('p2p');
    await screen.findByText('secret hello');
    await fireEvent.changeText(screen.getByLabelText('Message'), 'are you there');
    await fireEvent.press(screen.getByLabelText('Send'));
    expect(await screen.findByText(/Peer offline\./)).toBeTruthy();
    const failed = Object.values(useMessageStore.getState().timelines['general']!.byId).find((m) => m.localState === 'failed');
    expect(failed?.content).toBe('are you there');
  });

  it('shows the peer-to-peer badge and the honest link state above the composer', async () => {
    await open('p2p');
    await screen.findByText('secret hello');
    expect(screen.getByLabelText(/^Delivery mode: Peer-to-peer\./)).toBeTruthy();
    expect(screen.getByText('Peer-to-peer: a direct link opens when you send. The peer must be online.')).toBeTruthy();
    await act(async () => usePrivacyStore.getState().setP2P('general', 'unverified', false, 'Fingerprint mismatch.'));
    expect(await screen.findByText(/Peer identity could not be verified\. Sending is blocked\. Fingerprint mismatch\./)).toBeTruthy();
  });

  it('shows the standard badge and no status line in a normal channel', async () => {
    await open('standard');
    expect(screen.getByLabelText(/^Delivery mode: Standard\./)).toBeTruthy();
    expect(screen.queryByText(/Peer-to-peer:/)).toBeNull();
  });
});

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
const renderSheet = (peerId: string) =>
  render(
    <SafeAreaProvider initialMetrics={metrics}>
      <SafetyNumberSheet peerId={peerId} onClose={jest.fn()} />
    </SafeAreaProvider>,
  );

describe('safety number', () => {
  it('shows the groups computed for the first device of the peer', async () => {
    await renderSheet('u2');
    expect(await screen.findByText('11111  22222  33333')).toBeTruthy();
    expect(mockApi.listUserDevices).toHaveBeenCalledWith('u2');
    expect(mockPrivacy.p2p.safetyNumber).toHaveBeenCalledWith('u2', 'd9');
  });

  it('says so when the peer has no device that can be compared', async () => {
    mockApi.listUserDevices.mockResolvedValueOnce([]);
    await renderSheet('u3');
    expect(await screen.findByText('This person has no encryption-capable device yet.')).toBeTruthy();
  });
});
