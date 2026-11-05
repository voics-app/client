import { Alert } from 'react-native';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useMessageStore } from '@discordy/core/application/stores/messageStore';
import { Permission } from '@discordy/core/contracts/permissions';
import { ChannelType, type Channel, type Message } from '@discordy/core/contracts/rest';
import { PAT, resetStores, seedServer } from '../support/server';

const msg = (id: string, channel = 'general', extra: Partial<Message> = {}) =>
  ({ id, channel_id: channel, guild_id: 'g1', author: PAT, content: `text ${id}`, timestamp: new Date().toISOString(), edited_timestamp: null, mention_everyone: false, mentions: [], mention_roles: [], attachments: [], embeds: [], pinned: false, type: 0, ...extra }) as Message;
const thread = (id: string, name: string, extra: Partial<Channel> = {}) =>
  ({ id, type: ChannelType.PUBLIC_THREAD, guild_id: 'g1', parent_id: 'general', name, delivery_mode: 'standard', message_count: 3, thread_metadata: { archived: false, locked: false }, ...extra }) as unknown as Channel;

const mockApi = {
  messages: jest.fn(async (channel: string, _q?: object): Promise<Message[]> => (channel === 'general' ? [msg('100')] : [msg('900', channel, { content: 'inside the thread' })])),
  ack: jest.fn(async () => undefined),
  createThread: jest.fn(async (_c: string, body: { name: string }) => thread('5000', body.name)),
};
const mockSession = { boot: jest.fn(), login: jest.fn(), loginMfa: jest.fn(), logout: jest.fn() };
jest.mock('../../src/runtime', () => ({ getRuntime: () => ({ session: mockSession, gateway: { state: 'idle', resumeNow: jest.fn(), send: jest.fn() }, api: mockApi, apiUrl: 'https://api.test' }) }));

async function openChat(mine: bigint = 0n) {
  seedServer(mine);
  await renderRouter('./app', { initialUrl: '/servers/g1' });
  await fireEvent.press(await screen.findByLabelText('Open #general'));
  await screen.findByText('text 100');
}

describe('threads', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetStores();
    useMessageStore.getState().reset();
  });

  it('creates a thread from the message menu with a suggested name, then opens it', async () => {
    await openChat(Permission.CREATE_PUBLIC_THREADS);
    await fireEvent(screen.getByText('text 100'), 'longPress');
    await fireEvent.press(await screen.findByText('Create Thread'));
    const name = await screen.findByLabelText('Thread name');
    expect(name.props.value).toBe('text 100');
    await fireEvent.changeText(name, 'Plans');
    await fireEvent.press(screen.getByLabelText('Create thread'));
    expect(mockApi.createThread).toHaveBeenCalledWith('general', { name: 'Plans', message_id: '100' });
    await waitFor(() => expect(screen).toHavePathname('/servers/g1/5000'));
    expect(await screen.findByText('inside the thread')).toBeTruthy();
    expect(screen.getByText('Plans')).toBeTruthy();
    expect(useGuildStore.getState().channels['5000']?.guild_id).toBe('g1');
  });

  it('has no Create Thread without the permission', async () => {
    await openChat();
    await fireEvent(screen.getByText('text 100'), 'longPress');
    await screen.findByText('Reply');
    expect(screen.queryByText('Create Thread')).toBeNull();
  });

  it('keeps the sheet and says why when the thread cannot be created', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockApi.createThread.mockRejectedValueOnce(new Error('Missing permissions'));
    await openChat(Permission.CREATE_PUBLIC_THREADS);
    await fireEvent(screen.getByText('text 100'), 'longPress');
    await fireEvent.press(await screen.findByText('Create Thread'));
    await fireEvent.press(await screen.findByLabelText('Create thread'));
    await waitFor(() => expect(alert).toHaveBeenCalledWith('Could not create the thread', expect.stringContaining('Missing permissions')));
    expect(screen).toHavePathname('/servers/g1/general');
    alert.mockRestore();
  });

  it('shows a chip under the message that started a thread and opens the thread', async () => {
    mockApi.messages.mockResolvedValueOnce([msg('100', 'general', { thread: thread('5000', 'Plans') as never })]);
    await openChat();
    await fireEvent.press(screen.getByLabelText('Open thread Plans'));
    await waitFor(() => expect(screen).toHavePathname('/servers/g1/5000'));
    expect(await screen.findByText('inside the thread')).toBeTruthy();
  });

  it('opens the thread from the link in a thread notice', async () => {
    mockApi.messages.mockResolvedValueOnce([msg('100'), msg('101', 'general', { type: 18, content: '', thread: thread('5000', 'Plans') as never })]);
    await openChat();
    await fireEvent.press(screen.getByText('Plans'));
    await waitFor(() => expect(screen).toHavePathname('/servers/g1/5000'));
  });

  it('lists the threads of a channel from channel details, active first, and opens one', async () => {
    await openChat();
    await act(async () => {
      useGuildStore.getState().upsertChannel(thread('5001', 'Old news', { thread_metadata: { archived: true, locked: false } as never }));
      useGuildStore.getState().upsertChannel(thread('5002', 'Fresh'));
    });
    await fireEvent.press(screen.getByLabelText('#general details'));
    await fireEvent.press(await screen.findByLabelText('Threads'));
    expect(screen).toHavePathname('/threads/general');
    const rows = (await screen.findAllByRole('button')).filter((b) => String(b.props.accessibilityLabel).startsWith('Open thread'));
    expect(rows.map((r) => r.props.accessibilityLabel)).toEqual(['Open thread Fresh', 'Open thread Old news, archived']);
    expect(screen.getByText('3 messages - Archived')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Open thread Fresh'));
    await waitFor(() => expect(screen).toHavePathname('/servers/g1/5002'));
  });

  it('says how to start the first thread', async () => {
    await openChat();
    await fireEvent.press(screen.getByLabelText('#general details'));
    await fireEvent.press(await screen.findByLabelText('Threads'));
    expect(await screen.findByText(/No threads yet/)).toBeTruthy();
  });

  it('shows a thread as a chat named after it, with no Threads entry in its details', async () => {
    seedServer(0n);
    useGuildStore.getState().upsertChannel(thread('5000', 'Plans'));
    await renderRouter('./app', { initialUrl: '/servers/g1/5000' });
    expect(await screen.findByText('inside the thread')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Plans details'));
    expect(await screen.findByLabelText('Pinned messages')).toBeTruthy();
    expect(screen.queryByLabelText('Threads')).toBeNull();
  });

  it('closes the composer of a locked thread unless you manage threads', async () => {
    seedServer(0n);
    useGuildStore.getState().upsertChannel(thread('5000', 'Plans', { thread_metadata: { archived: false, locked: true } as never }));
    await renderRouter('./app', { initialUrl: '/servers/g1/5000' });
    expect(await screen.findByText('This thread is locked.')).toBeTruthy();
  });

  it('opens a locked thread for writing when you manage threads', async () => {
    seedServer(Permission.MANAGE_THREADS | Permission.SEND_MESSAGES_IN_THREADS);
    useGuildStore.getState().upsertChannel(thread('5000', 'Plans', { thread_metadata: { archived: false, locked: true } as never }));
    await renderRouter('./app', { initialUrl: '/servers/g1/5000' });
    await screen.findByText('inside the thread');
    expect(screen.queryByText('This thread is locked.')).toBeNull();
    expect(screen.getByLabelText('Message')).toBeTruthy();
  });
});
