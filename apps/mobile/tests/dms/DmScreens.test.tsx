import { Alert } from 'react-native';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { useClosedDmStore } from '@discordy/core/application/stores/closedDmStore';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useMessageStore } from '@discordy/core/application/stores/messageStore';
import { usePrefsStore } from '@discordy/core/application/stores/prefsStore';
import { useRelationshipStore } from '@discordy/core/application/stores/peopleStores';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { ChannelType, RelationshipType, type Channel, type Message, type User } from '@discordy/core/contracts/rest';

const mockApi = {
  messages: jest.fn(async (_c: string, _q?: object): Promise<Message[]> => []),
  ack: jest.fn(async (_c: string, _m: string): Promise<void> => undefined),
  userProfile: jest.fn(async (id: string) => ({ user: { id, username: 'pat', global_name: 'Pat', avatar: null, bio: 'Fresh bio from the server' }, mutual_guilds: [], mutual_friends: [] })),
};
const mockSession = { boot: jest.fn(), login: jest.fn(), loginMfa: jest.fn(), logout: jest.fn() };
jest.mock('../../src/runtime', () => ({ getRuntime: () => ({ session: mockSession, gateway: { state: 'idle', resumeNow: jest.fn() }, api: mockApi }) }));

const ME: User = { id: 'u1', username: 'me', global_name: 'Me Myself', avatar: null, email: 'me@example.test' };
const PAT: User = { id: 'u2', username: 'pat', global_name: 'Pat', avatar: null, bio: 'Old bio' };
const SAM: User = { id: 'u3', username: 'sam', global_name: null, avatar: null };
const THUMBS_UP = '\u{1F44D}';

const dm = (id: string, extra: Partial<Channel> = {}): Channel => ({ id, type: ChannelType.DM, delivery_mode: 'standard', recipients: [PAT], ...extra }) as Channel;
const message = (id: string, extra: Partial<Message> = {}): Message =>
  ({
    id,
    channel_id: '1000',
    author: PAT,
    content: 'hey you',
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
  }) as Message;

function seed(channels: Channel[]) {
  useSessionStore.setState({ status: 'ready', user: ME as never });
  useGuildStore.getState().hydrate([], channels);
}

describe('direct messages', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSessionStore.getState().reset();
    useGuildStore.getState().reset();
    useMessageStore.getState().reset();
    useClosedDmStore.setState({ closed: {} });
    useRelationshipStore.getState().hydrate([]);
    mockApi.messages.mockResolvedValue([message('1000000001')]);
  });

  it('lists conversations by recent activity and hides closed ones', async () => {
    seed([
      dm('1000', { last_message_id: '9000000000000000' }),
      dm('1001', { type: ChannelType.GROUP_DM, name: 'Book club', recipients: [PAT, SAM], last_message_id: '9100000000000000' }),
      dm('1002', { recipients: [SAM] }),
    ]);
    useClosedDmStore.setState({ closed: { '1002': '' } });
    await renderRouter('./app', { initialUrl: '/dms' });
    await screen.findByLabelText('Open Pat');
    const rows = screen.getAllByRole('button').filter((r) => String(r.props.accessibilityLabel).startsWith('Open '));
    expect(rows.map((r) => r.props.accessibilityLabel)).toEqual(['Open Book club', 'Open Pat']);
  });

  it('opens a 1:1 conversation in the shared channel screen with history and a composer', async () => {
    seed([dm('1000')]);
    await renderRouter('./app', { initialUrl: '/dms' });
    await fireEvent.press(await screen.findByLabelText('Open Pat'));
    expect(await screen.findByText('hey you')).toBeTruthy();
    expect(mockApi.messages).toHaveBeenCalledWith('1000', { limit: 50 });
    expect(screen.getByLabelText('Message')).toBeTruthy();
  });

  it('shows the private-delivery notice, never history or an error, for an encrypted DM', async () => {
    seed([dm('1000', { delivery_mode: 'p2p' })]);
    await renderRouter('./app', { initialUrl: '/dms' });
    await fireEvent.press(await screen.findByLabelText('Open Pat'));
    expect(await screen.findByText('Messages in this channel stay on devices, so there is no server history to show.')).toBeTruthy();
    expect(screen.getByText('This channel uses private delivery, which the mobile app does not support yet.')).toBeTruthy();
    expect(mockApi.messages).not.toHaveBeenCalled();
  });

  it('shows the profile of the other person from the DM header, with the fetched About me and Friends since', async () => {
    seed([dm('1000')]);
    useRelationshipStore.getState().hydrate([{ id: 'u2', type: RelationshipType.FRIEND, user: PAT, since: '2025-03-04T10:00:00Z' }]);
    await renderRouter('./app', { initialUrl: '/dms' });
    await fireEvent.press(await screen.findByLabelText('Open Pat'));
    await fireEvent.press(await screen.findByLabelText('View profile'));
    expect(await screen.findByText('Fresh bio from the server')).toBeTruthy();
    expect(screen.getByText('pat')).toBeTruthy();
    expect(screen.getByText('About me')).toBeTruthy();
    expect(screen.getByText('Friends since')).toBeTruthy();
    expect(mockApi.userProfile).toHaveBeenCalledWith('u2');
  });

  it('shows the friend in the header with call and video buttons that only show a notice', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    seed([dm('1000')]);
    await renderRouter('./app', { initialUrl: '/dms' });
    await fireEvent.press(await screen.findByLabelText('Open Pat'));
    expect(await screen.findByRole('header', { name: 'Pat' })).toBeTruthy();
    expect(screen.getByLabelText('Message').props.placeholder).toBe('Message @Pat');
    await fireEvent.press(screen.getByLabelText('Voice call'));
    await fireEvent.press(screen.getByLabelText('Video call'));
    expect(alert).toHaveBeenCalledTimes(2);
    expect(alert).toHaveBeenCalledWith('Calls', "Calls aren't in this test version yet.");
    alert.mockRestore();
  });

  it('has no header profile button in a group conversation, but author names open a profile', async () => {
    seed([dm('1000', { type: ChannelType.GROUP_DM, name: 'Book club', recipients: [PAT, SAM] })]);
    await renderRouter('./app', { initialUrl: '/dms' });
    await fireEvent.press(await screen.findByLabelText('Open Book club'));
    expect(screen.queryByLabelText('View profile')).toBeNull();
    await fireEvent.press(await screen.findByLabelText('View profile of Pat'));
    expect(await screen.findByText('Fresh bio from the server')).toBeTruthy();
    expect(screen.queryByText('Friends since')).toBeNull();
  });

  it('keeps the cached profile when the refresh fails', async () => {
    mockApi.userProfile.mockRejectedValueOnce(new Error('offline'));
    seed([dm('1000')]);
    await renderRouter('./app', { initialUrl: '/dms' });
    await fireEvent.press(await screen.findByLabelText('Open Pat'));
    await fireEvent.press(await screen.findByLabelText('View profile'));
    await waitFor(() => expect(mockApi.userProfile).toHaveBeenCalled());
    expect(await screen.findByText('Old bio')).toBeTruthy();
  });
});

describe('You tab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSessionStore.getState().reset();
    useGuildStore.getState().reset();
    useMessageStore.getState().reset();
    usePrefsStore.getState().set('showReactions', true);
  });

  it('turns reaction chips off in the Chat settings', async () => {
    seed([]);
    await renderRouter('./app', { initialUrl: '/settings/chat' });
    await fireEvent(await screen.findByLabelText('Show reactions'), 'valueChange', false);
    expect(usePrefsStore.getState().showReactions).toBe(false);
  });

  it('hides reaction chips in messages when the switch is off', async () => {
    seed([dm('1000')]);
    mockApi.messages.mockResolvedValue([message('1000000001', { reactions: [{ emoji: { id: null, name: THUMBS_UP }, count: 2, me: false }] })]);
    usePrefsStore.getState().set('showReactions', false);
    await renderRouter('./app', { initialUrl: '/dms/1000' });
    await screen.findByText('hey you');
    expect(screen.queryByLabelText(`${THUMBS_UP} 2`)).toBeNull();
    usePrefsStore.getState().set('showReactions', true);
    expect(await screen.findByLabelText(`${THUMBS_UP} 2`)).toBeTruthy();
  });
});
