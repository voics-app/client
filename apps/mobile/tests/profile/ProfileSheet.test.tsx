import { Alert } from 'react-native';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useUserNotesStore } from '@discordy/core/application/stores/notificationSettingsStore';
import { usePresenceStore, useRelationshipStore } from '@discordy/core/application/stores/peopleStores';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { ChannelType, RelationshipType, type Channel, type Relationship, type User } from '@discordy/core/contracts/rest';

const ME: User = { id: 'u1', username: 'me', global_name: 'Me Myself', avatar: null };
const PAT: User = { id: 'u2', username: 'pat', global_name: 'Pat', avatar: null, accent_color: 0x336699 };
const SAM: User = { id: 'u3', username: 'sam', global_name: 'Sam', avatar: null };
const dm = { id: '1000', type: ChannelType.DM, delivery_mode: 'standard', recipients: [PAT] } as unknown as Channel;

const mockApi = {
  userConnections: jest.fn(async (_id: string): Promise<{provider: string; account_id: string; name: string; visible: boolean}[]> => []),
  messages: jest.fn(async () => []),
  ack: jest.fn(async () => undefined),
  userProfile: jest.fn(async (id: string) => ({ user: { ...PAT, id, bio: 'Plays chess' }, mutual_guilds: [{ id: 'g1', nick: 'Patty' }, { id: 'left' }], mutual_friends: [SAM] })),
  putUserNote: jest.fn(async (_id: string, _note: string) => undefined),
  putRelationship: jest.fn(async (_id: string, _body?: object) => undefined),
  deleteRelationship: jest.fn(async (_id: string) => undefined),
  sendFriendRequest: jest.fn(async (_name: string) => undefined),
  createReport: jest.fn(async (_body: object) => undefined),
};
const mockSession = { boot: jest.fn(), login: jest.fn(), loginMfa: jest.fn(), logout: jest.fn() };
jest.mock('../../src/runtime', () => ({ getRuntime: () => ({ session: mockSession, gateway: { state: 'idle', resumeNow: jest.fn(), send: jest.fn() }, api: mockApi, apiUrl: 'https://api.test' }) }));

const friend = (type: number): Relationship => ({ id: 'u2', type, user: PAT, since: '2025-03-04T10:00:00Z' }) as Relationship;

async function openProfile(relationship?: Relationship) {
  useRelationshipStore.getState().hydrate(relationship ? [relationship] : []);
  await renderRouter('./app', { initialUrl: '/dms' });
  await fireEvent.press(await screen.findByLabelText('Open Pat'));
  await fireEvent.press(await screen.findByLabelText('View profile'));
  await screen.findByText('Plays chess');
}

describe('full profile sheet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSessionStore.getState().reset();
    useGuildStore.getState().reset();
    useUserNotesStore.getState().hydrate({});
    usePresenceStore.getState().reset();
    usePresenceStore.getState().setMany({ u2: { status: 'online', activities: [{ name: 'Chess', type: 0 }] } });
    useSessionStore.setState({ status: 'ready', user: ME as never });
    useGuildStore.getState().hydrate([{ id: 'g1', name: 'Home Base', icon: null, owner_id: 'x', roles: [], emojis: [], members: [], channels: [] } as never], [dm]);
  });

  it('shows the banner colour, status, About me, mutual servers and mutual friends', async () => {
    await openProfile(friend(RelationshipType.FRIEND));
    expect(screen.getByTestId('profile-banner').props.style).toEqual(expect.arrayContaining([expect.objectContaining({ backgroundColor: '#336699' })]));
    expect(screen.getByTestId('status-online')).toBeTruthy();
    expect(screen.getByText('Playing Chess')).toBeTruthy();
    expect(screen.getByText('Mutual servers - 1')).toBeTruthy();
    expect(screen.getByText('Home Base as Patty')).toBeTruthy();
    expect(screen.queryByText(/left/)).toBeNull();
    expect(screen.getByText('Mutual friends - 1')).toBeTruthy();
    expect(screen.getByText('Sam')).toBeTruthy();
    expect(screen.getByText('Friends since')).toBeTruthy();
  });

  it('shows the visible connections returned for the viewed profile', async () => {
    mockApi.userConnections.mockResolvedValueOnce([{ provider: 'github', account_id: '123', name: 'pat-code', visible: true }]);
    await openProfile(friend(RelationshipType.FRIEND));
    expect(await screen.findByText('GitHub: pat-code')).toBeTruthy();
    expect(mockApi.userConnections).toHaveBeenCalledWith('u2');
  });

  it('says when there is nothing in common', async () => {
    mockApi.userProfile.mockResolvedValueOnce({ user: { ...PAT, bio: 'Plays chess' }, mutual_guilds: [], mutual_friends: [] });
    await openProfile(friend(RelationshipType.FRIEND));
    expect(screen.getByText('No servers in common.')).toBeTruthy();
    expect(screen.getByText('No friends in common.')).toBeTruthy();
  });

  it('saves the note when the field loses focus, and only when it changed', async () => {
    useUserNotesStore.getState().set('u2', 'old');
    await openProfile(friend(RelationshipType.FRIEND));
    const note = screen.getByLabelText('Note');
    expect(note.props.value).toBe('old');
    await fireEvent(note, 'blur');
    expect(mockApi.putUserNote).not.toHaveBeenCalled();
    await fireEvent.changeText(note, ' remembers my name ');
    await fireEvent(note, 'blur');
    expect(mockApi.putUserNote).toHaveBeenCalledWith('u2', 'remembers my name');
    expect(useUserNotesStore.getState().byUser['u2']).toBe('remembers my name');
  });

  it('puts the old note back and says so when saving fails', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockApi.putUserNote.mockRejectedValueOnce(new Error('offline'));
    useUserNotesStore.getState().set('u2', 'old');
    await openProfile(friend(RelationshipType.FRIEND));
    await fireEvent.changeText(screen.getByLabelText('Note'), 'new');
    await fireEvent(screen.getByLabelText('Note'), 'blur');
    await waitFor(() => expect(alert).toHaveBeenCalledWith('Could not save the note', expect.stringContaining('offline')));
    await waitFor(() => expect(screen.getByLabelText('Note').props.value).toBe('old'));
    alert.mockRestore();
  });

  it('removes a friend', async () => {
    await openProfile(friend(RelationshipType.FRIEND));
    await fireEvent.press(screen.getByLabelText('Remove friend'));
    expect(mockApi.deleteRelationship).toHaveBeenCalledWith('u2');
  });

  it('adds someone who is not a friend and accepts a request from them', async () => {
    await openProfile();
    await fireEvent.press(screen.getByLabelText('Add friend'));
    expect(mockApi.sendFriendRequest).toHaveBeenCalledWith('pat');
  });

  it('accepts an incoming request from the profile', async () => {
    await openProfile(friend(RelationshipType.INCOMING));
    await fireEvent.press(screen.getByLabelText('Accept friend request'));
    expect(mockApi.putRelationship).toHaveBeenCalledWith('u2');
  });

  it('shows Request sent, disabled, for an outgoing request', async () => {
    await openProfile(friend(RelationshipType.OUTGOING));
    expect(screen.getByLabelText('Request sent').props.accessibilityState.disabled).toBe(true);
  });

  it('blocks only after confirming', async () => {
    await openProfile(friend(RelationshipType.FRIEND));
    await fireEvent.press(screen.getByLabelText('Block'));
    expect(mockApi.putRelationship).not.toHaveBeenCalled();
    await fireEvent.press(await screen.findByLabelText('Cancel'));
    await fireEvent.press(await screen.findByLabelText('Block'));
    await fireEvent.press((await screen.findAllByLabelText('Block')).at(-1)!);
    expect(mockApi.putRelationship).toHaveBeenCalledWith('u2', { type: RelationshipType.BLOCKED });
  });

  it('Report opens the report sheet for that person and sends the report', async () => {
    mockApi.createReport.mockResolvedValue(undefined);
    await openProfile(friend(RelationshipType.FRIEND));
    await fireEvent.press(screen.getByLabelText('Report'));
    expect(await screen.findByText('Report Pat')).toBeTruthy();
    await fireEvent.press(await screen.findByLabelText('Spam'));
    await fireEvent.press(screen.getByLabelText('Send report'));
    await waitFor(() => expect(mockApi.createReport).toHaveBeenCalledWith({ target: 'user', user_id: 'u2', category: 'spam' }));
  });

  it('offers only Unblock for a blocked person, with no Message button', async () => {
    await openProfile(friend(RelationshipType.BLOCKED));
    expect(screen.getByLabelText('Unblock')).toBeTruthy();
    expect(screen.queryByText('Message')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Unblock'));
    expect(mockApi.deleteRelationship).toHaveBeenCalledWith('u2');
  });

  it('shows a mutual-free profile of a bot and no friend button', async () => {
    mockApi.userProfile.mockResolvedValueOnce({ user: { ...PAT, bot: true, bio: 'Plays chess' }, mutual_guilds: [], mutual_friends: [] });
    useGuildStore.getState().upsertChannel({ ...dm, recipients: [{ ...PAT, bot: true }] } as Channel);
    await openProfile();
    expect(screen.queryByLabelText('Add friend')).toBeNull();
    expect(screen.queryByText(/Mutual/)).toBeNull();
    await act(async () => undefined);
  });
});
