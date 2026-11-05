import { Alert } from 'react-native';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { useClosedDmStore } from '@discordy/core/application/stores/closedDmStore';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useMessageStore } from '@discordy/core/application/stores/messageStore';
import { useNotificationSettingsStore } from '@discordy/core/application/stores/notificationSettingsStore';
import { useRelationshipStore } from '@discordy/core/application/stores/peopleStores';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { ChannelType, RelationshipType, type Channel, type User } from '@discordy/core/contracts/rest';

const group = (id: string, recipients: User[]) => ({ id, type: ChannelType.GROUP_DM, delivery_mode: 'standard', name: 'Book club', recipients }) as unknown as Channel;
const mockApi = {
  messages: jest.fn(async () => []),
  ack: jest.fn(async () => undefined),
  updateSettings: jest.fn(async (patch: object) => patch),
  openPrivateChannel: jest.fn(async (_ids: string[]): Promise<Channel> => dm('7000', [PAT])),
  removeGroupRecipient: jest.fn(async () => undefined),
  updateGuildNotificationSettings: jest.fn(async (_g: string | null, patch: object) => ({ guild_id: null, message_notifications: null, suppress_everyone: false, suppress_roles: false, muted: false, mute_config: null, hide_muted_channels: false, channel_overrides: [], ...patch })),
  userProfile: jest.fn(async (id: string) => ({ user: { id, username: 'pat', global_name: 'Pat', avatar: null }, mutual_guilds: [], mutual_friends: [] })),
};
const mockSession = { boot: jest.fn(), login: jest.fn(), loginMfa: jest.fn(), logout: jest.fn() };
jest.mock('../../src/runtime', () => ({ getRuntime: () => ({ session: mockSession, gateway: { state: 'idle', resumeNow: jest.fn(), send: jest.fn() }, api: mockApi, apiUrl: 'https://api.test' }) }));

const ME: User = { id: 'u1', username: 'me', global_name: 'Me Myself', avatar: null };
const PAT: User = { id: 'u2', username: 'pat', global_name: 'Pat', avatar: null };
const SAM: User = { id: 'u3', username: 'sam', global_name: 'Sam', avatar: null };
const dm = (id: string, recipients: User[], extra: Partial<Channel> = {}) => ({ id, type: ChannelType.DM, delivery_mode: 'standard', recipients, ...extra }) as unknown as Channel;

function seed(channels: Channel[]) {
  useSessionStore.setState({ status: 'ready', user: ME as never, settings: {} as never });
  useGuildStore.getState().hydrate([], channels);
}

describe('direct message management', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSessionStore.getState().reset();
    useGuildStore.getState().reset();
    useMessageStore.getState().reset();
    useClosedDmStore.setState({ closed: {} });
    useNotificationSettingsStore.getState().hydrate([]);
    useRelationshipStore.getState().hydrate([
      { id: 'u2', type: RelationshipType.FRIEND, user: PAT },
      { id: 'u3', type: RelationshipType.FRIEND, user: SAM },
      { id: 'u9', type: RelationshipType.INCOMING, user: { id: 'u9', username: 'zed', global_name: 'Zed', avatar: null } },
    ]);
  });

  it('puts pinned conversations first under a Pinned heading and shows the request count on Friends', async () => {
    seed([dm('1000', [PAT], { last_message_id: '9100000000000000' }), group('1001', [PAT, SAM])]);
    useSessionStore.setState({ settings: { pinned_dm_channel_ids: ['1001'] } as never });
    await renderRouter('./app', { initialUrl: '/dms' });
    await screen.findByLabelText('Open Pat');
    expect(screen.getByText('Pinned')).toBeTruthy();
    expect(screen.getAllByText('Direct messages')).toHaveLength(2);
    const rows = screen.getAllByRole('button').filter((r) => String(r.props.accessibilityLabel).startsWith('Open '));
    expect(rows.map((r) => r.props.accessibilityLabel)).toEqual(['Open Book club', 'Open Pat']);
    expect(screen.getByLabelText('1 friend requests')).toBeTruthy();
  });

  it('opens the conversation menu on long press and pins from it', async () => {
    seed([dm('1000', [PAT])]);
    await renderRouter('./app', { initialUrl: '/dms' });
    await fireEvent(await screen.findByLabelText('Open Pat'), 'longPress');
    await fireEvent.press(await screen.findByLabelText('Pin Conversation'));
    expect(mockApi.updateSettings).toHaveBeenCalledWith({ pinned_dm_channel_ids: ['1000'] });
    expect(useSessionStore.getState().settings.pinned_dm_channel_ids).toEqual(['1000']);
  });

  it('tells you when five conversations are already pinned', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    seed([dm('1000', [PAT])]);
    useSessionStore.setState({ settings: { pinned_dm_channel_ids: ['a', 'b', 'c', 'd', 'e'] } as never });
    await renderRouter('./app', { initialUrl: '/dms' });
    await fireEvent(await screen.findByLabelText('Open Pat'), 'longPress');
    expect(await screen.findByLabelText('Pin conversation (limit 5)')).toBeTruthy();
    expect(mockApi.updateSettings).not.toHaveBeenCalled();
    alert.mockRestore();
  });

  it('closes a conversation, which then leaves the list until a newer message', async () => {
    seed([dm('1000', [PAT], { last_message_id: '55' })]);
    await renderRouter('./app', { initialUrl: '/dms' });
    await fireEvent(await screen.findByLabelText('Open Pat'), 'longPress');
    await fireEvent.press(await screen.findByLabelText('Close DM'));
    await waitFor(() => expect(screen.queryByLabelText('Open Pat')).toBeNull());
    expect(useClosedDmStore.getState().closed).toEqual({ '1000': '55' });
    await act(async () => useGuildStore.getState().upsertChannel(dm('1000', [PAT], { last_message_id: '9999999999999999' })));
    expect(await screen.findByLabelText('Open Pat')).toBeTruthy();
  });

  it('mutes a conversation for a duration from the menu', async () => {
    seed([dm('1000', [PAT])]);
    await renderRouter('./app', { initialUrl: '/dms' });
    await fireEvent(await screen.findByLabelText('Open Pat'), 'longPress');
    await fireEvent.press(await screen.findByLabelText('Mute Conversation'));
    await fireEvent.press(await screen.findByLabelText('For 1 hour'));
    expect(mockApi.updateGuildNotificationSettings).toHaveBeenCalledWith(null, expect.objectContaining({ channel_overrides: [expect.objectContaining({ channel_id: '1000', muted: true })] }));
  });

  it('leaves a group only after confirming', async () => {
    seed([group('1001', [PAT, SAM])]);
    await renderRouter('./app', { initialUrl: '/dms' });
    await fireEvent(await screen.findByLabelText('Open Book club'), 'longPress');
    await fireEvent.press(await screen.findByLabelText('Leave Group'));
    expect(mockApi.removeGroupRecipient).not.toHaveBeenCalled();
    await fireEvent.press(await screen.findByLabelText('Leave group'));
    expect(mockApi.removeGroupRecipient).toHaveBeenCalledWith('1001', '@me');
    await waitFor(() => expect(screen.queryByLabelText('Open Book club')).toBeNull());
  });

  it('has no Leave entry for a 1:1 conversation but does offer Profile', async () => {
    seed([dm('1000', [PAT])]);
    await renderRouter('./app', { initialUrl: '/dms' });
    await fireEvent(await screen.findByLabelText('Open Pat'), 'longPress');
    expect(await screen.findByLabelText('Profile')).toBeTruthy();
    expect(screen.queryByLabelText('Leave Group')).toBeNull();
  });
});

describe('new message', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSessionStore.getState().reset();
    useGuildStore.getState().reset();
    useMessageStore.getState().reset();
    useClosedDmStore.setState({ closed: {} });
    useRelationshipStore.getState().hydrate([
      { id: 'u2', type: RelationshipType.FRIEND, user: PAT },
      { id: 'u3', type: RelationshipType.FRIEND, user: SAM },
    ]);
    seed([]);
  });

  const open = async () => {
    await renderRouter('./app', { initialUrl: '/dms' });
    await fireEvent.press(await screen.findByLabelText('New message'));
    await screen.findByLabelText('Pat');
  };

  it('lists friends, filters by search and opens the DM with one person', async () => {
    await open();
    expect(screen).toHavePathname('/dms/new');
    await fireEvent.changeText(screen.getByLabelText('To'), 'sa');
    expect(screen.queryByLabelText('Pat')).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('To'), '');
    await fireEvent.press(screen.getByLabelText('Pat'));
    await fireEvent.press(screen.getByLabelText('Message'));
    expect(mockApi.openPrivateChannel).toHaveBeenCalledWith(['u2']);
    await waitFor(() => expect(screen).toHavePathname('/dms/7000'));
  });

  it('makes a group DM from several people', async () => {
    mockApi.openPrivateChannel.mockResolvedValueOnce(group('7001', [PAT, SAM]));
    await open();
    await fireEvent.press(screen.getByLabelText('Pat'));
    await fireEvent.press(screen.getByLabelText('Sam'));
    expect(screen.getByLabelText('Pat').props.accessibilityState.checked).toBe(true);
    await fireEvent.press(screen.getByLabelText('Create group'));
    expect(mockApi.openPrivateChannel).toHaveBeenCalledWith(['u2', 'u3']);
    await waitFor(() => expect(screen).toHavePathname('/dms/7001'));
  });

  it('offers no confirm button until someone is picked, and one tap on a picked person unpicks them', async () => {
    await open();
    expect(screen.queryByLabelText('Message')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Pat'));
    await fireEvent.press(screen.getByLabelText('Pat'));
    expect(screen.queryByLabelText('Message')).toBeNull();
  });

  it('shows the failure and stays when the DM cannot be opened', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockApi.openPrivateChannel.mockRejectedValueOnce(new Error('Cannot message this user'));
    await open();
    await fireEvent.press(screen.getByLabelText('Pat'));
    await fireEvent.press(screen.getByLabelText('Message'));
    await waitFor(() => expect(alert).toHaveBeenCalledWith('Could not open conversation', expect.stringContaining('Cannot message this user')));
    expect(screen).toHavePathname('/dms/new');
    alert.mockRestore();
  });
});
