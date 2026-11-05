import { Alert } from 'react-native';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import * as Clipboard from 'expo-clipboard';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useMessageStore } from '@discordy/core/application/stores/messageStore';
import { useReadNavStore } from '@discordy/core/application/stores/readNavStore';
import { Permission } from '@discordy/core/contracts/permissions';
import type { Message } from '@discordy/core/contracts/rest';
import { ME, PAT, resetStores, seedServer } from '../support/server';

const msg = (id: string, extra: Partial<Message> = {}) =>
  ({ id, channel_id: 'general', guild_id: 'g1', author: PAT, content: `text ${id}`, timestamp: new Date().toISOString(), edited_timestamp: null, mention_everyone: false, mentions: [], mention_roles: [], attachments: [], embeds: [], pinned: false, type: 0, ...extra }) as Message;

const mockApi = {
  messages: jest.fn(async (_c: string, _q?: object): Promise<Message[]> => [msg('100'), msg('101', { type: 6, content: '', author: ME, message_reference: { message_id: '100' } as never })]),
  ack: jest.fn(async () => undefined),
  pins: jest.fn(async (_c: string): Promise<Message[]> => [msg('100', { pinned: true })]),
  unpin: jest.fn(async (_c: string, _m: string) => undefined),
  userProfile: jest.fn(async (id: string) => ({ user: { id, username: 'pat', global_name: 'Pat', avatar: null }, mutual_guilds: [], mutual_friends: [] })),
};
const mockSession = { boot: jest.fn(), login: jest.fn(), loginMfa: jest.fn(), logout: jest.fn() };
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));
jest.mock('../../src/runtime', () => ({ getRuntime: () => ({ session: mockSession, gateway: { state: 'idle', resumeNow: jest.fn(), send: jest.fn() }, api: mockApi, apiUrl: 'https://api.test' }) }));

async function openChat(mine: bigint = 0n) {
  seedServer(mine);
  await renderRouter('./app', { initialUrl: '/servers/g1' });
  await fireEvent.press(await screen.findByLabelText('Open #general'));
  await screen.findByText('text 100');
}

describe('pinned messages and channel details', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetStores();
    useMessageStore.getState().reset();
    useReadNavStore.setState({ jump: null });
  });

  it('opens the pins from the link in a pin notice', async () => {
    await openChat();
    await fireEvent.press(screen.getByText('pinned messages'));
    expect(screen).toHavePathname('/pins/general');
    expect(await screen.findByText('text 100')).toBeTruthy();
    expect(mockApi.pins).toHaveBeenCalledWith('general');
  });

  it('opens channel details from the chat title with the name, topic and pinned messages', async () => {
    await openChat();
    useGuildStore.getState().upsertChannel({ ...useGuildStore.getState().channels['general']!, topic: 'Talk about anything' });
    await fireEvent.press(screen.getByLabelText('#general details'));
    expect(await screen.findByText('Talk about anything')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Pinned messages'));
    await waitFor(() => expect(screen).toHavePathname('/pins/general'));
  });

  it('opens the member list from channel details and copies the channel link', async () => {
    await openChat();
    await fireEvent.press(screen.getByLabelText('#general details'));
    await fireEvent.press(await screen.findByLabelText('Copy link'));
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith(expect.stringContaining('/g1/general'));
    await fireEvent.press(screen.getByLabelText('#general details'));
    await fireEvent.press(await screen.findByLabelText('Members'));
    await waitFor(() => expect(screen).toHavePathname('/servers/g1/members'));
  });

  it('shows the pins with a jump that goes back to the chat at that message', async () => {
    await openChat();
    await fireEvent.press(screen.getByText('pinned messages'));
    await fireEvent.press(await screen.findByLabelText('Jump to message from Pat'));
    await waitFor(() => expect(screen).toHavePathname('/servers/g1/general'));
    expect(useReadNavStore.getState().jump).toBeNull();
  });

  it('says when nothing is pinned', async () => {
    mockApi.pins.mockResolvedValueOnce([]);
    await openChat();
    await fireEvent.press(screen.getByText('pinned messages'));
    expect(await screen.findByText(/No pinned messages/)).toBeTruthy();
  });

  it('offers a retry when the pins cannot be loaded', async () => {
    mockApi.pins.mockRejectedValueOnce(new Error('Server down'));
    await openChat();
    await fireEvent.press(screen.getByText('pinned messages'));
    await fireEvent.press(await screen.findByText(/Server down/));
    expect(await screen.findByText('text 100')).toBeTruthy();
  });

  it('offers no Unpin without Manage Messages', async () => {
    await openChat();
    await fireEvent.press(screen.getByText('pinned messages'));
    await screen.findByText('text 100');
    expect(screen.queryByLabelText('Unpin message from Pat')).toBeNull();
  });

  it('unpins for a moderator after confirming', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_title, _body, buttons) => buttons?.find((b) => b.style === 'destructive')?.onPress?.());
    await openChat(Permission.MANAGE_MESSAGES);
    await fireEvent.press(screen.getByText('pinned messages'));
    await fireEvent.press(await screen.findByLabelText('Unpin message from Pat'));
    expect(alert).toHaveBeenCalledWith('Unpin this message?', expect.any(String), expect.any(Array));
    await waitFor(() => expect(mockApi.unpin).toHaveBeenCalledWith('general', '100'));
    await waitFor(() => expect(screen.queryByText('text 100')).toBeNull());
    alert.mockRestore();
  });
});
