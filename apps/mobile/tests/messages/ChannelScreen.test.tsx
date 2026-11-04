import { Alert } from 'react-native';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useMessageStore } from '@discordy/core/application/stores/messageStore';
import { useReadStateStore } from '@discordy/core/application/stores/peopleStores';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { Permission } from '@discordy/core/contracts/permissions';
import { ChannelType, type GuildFull, type Message } from '@discordy/core/contracts/rest';
import { ApiError } from '@discordy/core/infrastructure/http/httpClient';

const mockApi = {
  messages: jest.fn(async (_c: string, _q?: { before?: string }): Promise<Message[]> => []),
  ack: jest.fn(async (_c: string, _m: string): Promise<void> => undefined),
  sendMessage: jest.fn(async (_c: string, body: { content: string; nonce: string }): Promise<Message> => message(900, { content: body.content, nonce: body.nonce })),
  editMessage: jest.fn(async (_c: string, id: string, patch: { content?: string }): Promise<Message> => message(1, { id, ...patch })),
  deleteMessage: jest.fn(async (_c: string, _id: string): Promise<void> => undefined),
  addReaction: jest.fn(async (_c: string, _id: string, _e: string): Promise<void> => undefined),
  removeReaction: jest.fn(async (_c: string, _id: string, _e: string): Promise<void> => undefined),
};
const mockSession = { boot: jest.fn(), login: jest.fn(), loginMfa: jest.fn(), logout: jest.fn() };
jest.mock('../../src/runtime', () => ({ getRuntime: () => ({ session: mockSession, gateway: { state: 'idle', resumeNow: jest.fn() }, api: mockApi }) }));

const ME = { id: 'u1', username: 'me', global_name: 'Me Myself', discriminator: '0', avatar: null };
const OTHER = { id: 'u2', username: 'pat', global_name: 'Pat', discriminator: '0', avatar: null };
const BASIC = Permission.VIEW_CHANNEL | Permission.SEND_MESSAGES | Permission.READ_MESSAGE_HISTORY | Permission.ADD_REACTIONS;

const snow = (n: number) => String(1000000 + n);
function message(n: number, extra: Partial<Message> = {}): Message {
  return {
    id: snow(n),
    channel_id: 'general',
    guild_id: 'g1',
    author: ME,
    content: `message ${n}`,
    timestamp: new Date().toISOString(),
    edited_timestamp: null,
    mention_everyone: false,
    mentions: [],
    mention_roles: [],
    attachments: [],
    embeds: [],
    pinned: false,
    type: 0,
    ...extra,
  } as Message;
}
function guild(permissions: bigint, channelExtra: object = {}): GuildFull {
  const everyone = { id: 'g1', name: '@everyone', color: 0, hoist: false, position: 0, permissions: String(permissions), managed: false, mentionable: false };
  return {
    id: 'g1',
    name: 'Home Base',
    icon: null,
    owner_id: 'owner',
    roles: [everyone],
    emojis: [],
    members: [{ user: ME, roles: [] }],
    channels: [{ id: 'general', type: ChannelType.GUILD_TEXT, guild_id: 'g1', name: 'general', position: 0, delivery_mode: 'standard', ...channelExtra }],
  } as unknown as GuildFull;
}

async function open(permissions: bigint = BASIC, channelExtra: object = {}) {
  useSessionStore.setState({ status: 'ready', user: ME as never });
  useGuildStore.getState().hydrate([guild(permissions, channelExtra)], []);
  await renderRouter('./app', { initialUrl: '/servers/g1' });
  await fireEvent.press(await screen.findByLabelText('Open #general'));
}

const timeline = () => useMessageStore.getState().timelines['general']!;

describe('channel screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSessionStore.getState().reset();
    useGuildStore.getState().reset();
    useMessageStore.getState().reset();
    useReadStateStore.getState().reset();
    mockApi.messages.mockResolvedValue([message(2, { author: OTHER }), message(1)]);
  });

  it('opens from the channel list and shows loaded history', async () => {
    await open();
    expect(await screen.findByText('message 1')).toBeTruthy();
    expect(screen.getByText('message 2')).toBeTruthy();
    expect(mockApi.messages).toHaveBeenCalledWith('general', { limit: 50 });
  });

  it('shows live updates from the store', async () => {
    await open();
    await screen.findByText('message 1');
    await act(async () => useMessageStore.getState().receive(message(3, { author: OTHER, content: 'fresh news' })));
    expect(await screen.findByText('fresh news')).toBeTruthy();
    await act(async () => useMessageStore.getState().patch('general', snow(3), { content: 'fresh news, edited' }));
    expect(await screen.findByText('fresh news, edited')).toBeTruthy();
    await act(async () => useMessageStore.getState().remove('general', snow(3)));
    expect(screen.queryByText('fresh news, edited')).toBeNull();
  });

  it('loads older messages when the list reaches its start', async () => {
    mockApi.messages.mockResolvedValueOnce(Array.from({ length: 50 }, (_, i) => message(100 + i)));
    await open();
    await screen.findByText('message 149');
    mockApi.messages.mockResolvedValueOnce([message(5, { content: 'ancient' })]);
    await fireEvent(screen.getByTestId('message-list'), 'endReached');
    // The list only renders a window of rows, so the prepended page is checked in the store.
    await waitFor(() => expect(timeline().ids[0]).toBe(snow(5)));
    expect(mockApi.messages).toHaveBeenLastCalledWith('general', { before: snow(100), limit: 50 });
  });

  it('sends a message and clears the composer', async () => {
    await open();
    await screen.findByText('message 1');
    await fireEvent.changeText(screen.getByLabelText('Message'), 'hello there');
    await fireEvent.press(screen.getByLabelText('Send'));
    await waitFor(() => expect(mockApi.sendMessage).toHaveBeenCalledWith('general', expect.objectContaining({ content: 'hello there' })));
    expect(screen.getByLabelText('Message').props.value).toBe('');
    expect(await screen.findByText('hello there')).toBeTruthy();
  });

  it('shows a send failure with the reason and lets the user retry or discard it', async () => {
    await open();
    await screen.findByText('message 1');
    mockApi.sendMessage.mockRejectedValueOnce(new ApiError(0, 0, 'network'));
    await fireEvent.changeText(screen.getByLabelText('Message'), 'lost words');
    await fireEvent.press(screen.getByLabelText('Send'));
    expect(await screen.findByText('Not sent: You appear to be offline.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Retry'));
    await waitFor(() => expect(mockApi.sendMessage).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText('Not sent: You appear to be offline.')).toBeNull());
    expect(await screen.findByText('lost words')).toBeTruthy();

    mockApi.sendMessage.mockRejectedValueOnce(new ApiError(500, 0, 'Server exploded'));
    await fireEvent.changeText(screen.getByLabelText('Message'), 'second try');
    await fireEvent.press(screen.getByLabelText('Send'));
    await fireEvent.press(await screen.findByText('Discard'));
    expect(screen.queryByText('second try')).toBeNull();
  });

  it('offers edit and delete only on messages the user may change', async () => {
    await open();
    await fireEvent(await screen.findByText('message 1'), 'longPress');
    expect(screen.getByText('Edit')).toBeTruthy();
    expect(screen.getByText('Delete')).toBeTruthy();
    expect(screen.getByText('Reply')).toBeTruthy();
    await fireEvent.press(screen.getByText('Cancel'));
    await fireEvent(screen.getByText('message 2'), 'longPress');
    expect(screen.queryByText('Edit')).toBeNull();
    expect(screen.queryByText('Delete')).toBeNull();
    expect(screen.getByText('Reply')).toBeTruthy();
  });

  it('offers delete on other messages to moderators', async () => {
    await open(BASIC | Permission.MANAGE_MESSAGES);
    await fireEvent(await screen.findByText('message 2'), 'longPress');
    expect(screen.getByText('Delete')).toBeTruthy();
    expect(screen.queryByText('Edit')).toBeNull();
  });

  it('edits an own message', async () => {
    await open();
    await fireEvent(await screen.findByText('message 1'), 'longPress');
    await fireEvent.press(screen.getByText('Edit'));
    expect(screen.getByLabelText('Message').props.value).toBe('message 1');
    await fireEvent.changeText(screen.getByLabelText('Message'), 'message one');
    await fireEvent.press(screen.getByLabelText('Save edit'));
    await waitFor(() => expect(mockApi.editMessage).toHaveBeenCalledWith('general', snow(1), { content: 'message one' }));
    expect(await screen.findByText('message one')).toBeTruthy();
    expect(screen.getByLabelText('Message').props.value).toBe('');
  });

  it('deletes an own message after confirmation', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await open();
    await fireEvent(await screen.findByText('message 1'), 'longPress');
    await fireEvent.press(screen.getByText('Delete'));
    expect(mockApi.deleteMessage).not.toHaveBeenCalled();
    const buttons = alert.mock.calls[0]![2]!;
    await act(async () => buttons.find((b) => b.style === 'destructive')!.onPress!());
    expect(mockApi.deleteMessage).toHaveBeenCalledWith('general', snow(1));
    await waitFor(() => expect(screen.queryByText('message 1')).toBeNull());
    alert.mockRestore();
  });

  it('replies to a message', async () => {
    await open();
    await fireEvent(await screen.findByText('message 2'), 'longPress');
    await fireEvent.press(screen.getByText('Reply'));
    expect(screen.getByText('Replying to Pat')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Message'), 'answer');
    await fireEvent.press(screen.getByLabelText('Send'));
    await waitFor(() => expect(mockApi.sendMessage).toHaveBeenCalledWith('general', expect.objectContaining({ message_reference: expect.objectContaining({ message_id: snow(2) }) })));
    expect(screen.queryByText('Replying to Pat')).toBeNull();
  });

  it('adds a reaction from the sheet and removes it by tapping the chip', async () => {
    await open();
    await fireEvent(await screen.findByText('message 2'), 'longPress');
    await fireEvent.press(screen.getByLabelText('React with 👍'));
    await waitFor(() => expect(mockApi.addReaction).toHaveBeenCalledWith('general', snow(2), '👍'));
    const chip = await screen.findByLabelText('👍 1, you reacted');
    await fireEvent.press(chip);
    await waitFor(() => expect(mockApi.removeReaction).toHaveBeenCalledWith('general', snow(2), '👍'));
    expect(screen.queryByLabelText('👍 1, you reacted')).toBeNull();
  });

  it('tells the user when a reaction is refused', async () => {
    mockApi.addReaction.mockRejectedValueOnce(new ApiError(403, 0, 'Missing Permissions'));
    await open();
    await fireEvent(await screen.findByText('message 2'), 'longPress');
    await fireEvent.press(screen.getByLabelText('React with 👍'));
    expect(await screen.findByText('Missing Permissions')).toBeTruthy();
    expect(timeline().byId[snow(2)]?.reactions ?? []).toEqual([]);
  });

  it('disables the composer without SEND_MESSAGES', async () => {
    await open(Permission.VIEW_CHANNEL | Permission.READ_MESSAGE_HISTORY);
    expect(await screen.findByText('You do not have permission to send messages in this channel.')).toBeTruthy();
    expect(screen.queryByLabelText('Message')).toBeNull();
  });

  it('explains that private channels are not available yet', async () => {
    await open(BASIC, { delivery_mode: 'ephemeral' });
    expect(await screen.findByText('This channel uses private delivery, which the mobile app does not support yet.')).toBeTruthy();
    expect(mockApi.messages).not.toHaveBeenCalled();
  });

  it('shows a history load failure with a retry', async () => {
    mockApi.messages.mockRejectedValueOnce(new ApiError(500, 0, 'Server exploded'));
    await open();
    expect(await screen.findByText('Server exploded')).toBeTruthy();
    await fireEvent.press(screen.getByText('Try again'));
    expect(await screen.findByText('message 1')).toBeTruthy();
  });

  it('acks the latest message when the channel opens, clearing its unread state', async () => {
    useReadStateStore.getState().hydrate([{ id: 'general', last_message_id: snow(0), mention_count: 1 }]);
    await open();
    await screen.findByText('message 2');
    await waitFor(() => expect(mockApi.ack).toHaveBeenCalledWith('general', snow(2)));
    expect(useReadStateStore.getState().byChannel['general']).toEqual({ lastReadId: snow(2), mentionCount: 0 });
    await act(async () => useMessageStore.getState().receive(message(3, { author: OTHER })));
    await waitFor(() => expect(mockApi.ack).toHaveBeenLastCalledWith('general', snow(3)));
  });

  it('shows the channel name in the header with no profile or call buttons', async () => {
    await open();
    await screen.findByText('message 1');
    expect(screen.getByText('#general')).toBeTruthy();
    expect(screen.queryByLabelText('View profile')).toBeNull();
    expect(screen.queryByLabelText('Voice call')).toBeNull();
    expect(screen.queryByText('Profile')).toBeNull();
  });

  it('hints with the channel name, shows Send only when there is text, and says attachments are not built', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await open();
    await screen.findByText('message 1');
    expect(screen.getByLabelText('Message').props.placeholder).toBe('Message #general');
    expect(screen.queryByLabelText('Send')).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('Message'), 'hi');
    expect(screen.getByLabelText('Send')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Add attachment'));
    expect(alert).toHaveBeenCalledWith('Attachments', expect.stringContaining('aren'));
    alert.mockRestore();
  });

  it('leaves room between the newest message and the composer', async () => {
    await open();
    await screen.findByText('message 1');
    const style = screen.getByTestId('message-list').props.contentContainerStyle;
    expect(style.paddingTop).toBeGreaterThanOrEqual(12);
    expect(style.paddingBottom).toBeGreaterThanOrEqual(12);
  });
});
