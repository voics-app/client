import { Alert } from 'react-native';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { useClosedDmStore } from '@discordy/core/application/stores/closedDmStore';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { usePresenceStore, useRelationshipStore } from '@discordy/core/application/stores/peopleStores';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { ChannelType, RelationshipType, type Channel, type Relationship, type User } from '@discordy/core/contracts/rest';
import { ApiError } from '@discordy/core/infrastructure/http/httpClient';

const ME: User = { id: 'u1', username: 'me', global_name: 'Me Myself', avatar: null };
const user = (id: string, name: string): User => ({ id, username: name.toLowerCase(), global_name: name, avatar: null });
const rel = (id: string, name: string, type: number): Relationship => ({ id, type, user: user(id, name) }) as Relationship;

const mockApi = {
  favouriteFriends: jest.fn(async () => []),
  setFavouriteFriend: jest.fn(async (_id: string, _value: boolean) => undefined),
  useFriendInvite: jest.fn(async (_token: string) => undefined),
  messages: jest.fn(async () => []),
  ack: jest.fn(async () => undefined),
  putRelationship: jest.fn(async (_id: string, _body?: object) => undefined),
  deleteRelationship: jest.fn(async (_id: string) => undefined),
  sendFriendRequest: jest.fn(async (_name: string) => undefined),
  openPrivateChannel: jest.fn(async (_ids: string[]) => ({ id: '7000', type: ChannelType.DM, delivery_mode: 'standard', recipients: [user('u2', 'Pat')] }) as unknown as Channel),
  userProfile: jest.fn(async (id: string) => ({ user: user(id, 'Pat'), mutual_guilds: [], mutual_friends: [] })),
};
const mockSession = { boot: jest.fn(), login: jest.fn(), loginMfa: jest.fn(), logout: jest.fn() };
jest.mock('../../src/runtime', () => ({ getRuntime: () => ({ session: mockSession, gateway: { state: 'idle', resumeNow: jest.fn(), send: jest.fn() }, api: mockApi, apiUrl: 'https://api.test' }) }));

async function openFriends(relationships: Relationship[]) {
  useRelationshipStore.getState().hydrate(relationships);
  await renderRouter('./app', { initialUrl: '/dms' });
  await fireEvent.press(await screen.findByLabelText('Friends'));
  await screen.findByLabelText('Add friend');
}

describe('friends', () => {
  it('keeps Add friend pinned outside the scrolling tabs so it is never pushed off the right edge', async () => {
    await openFriends([]);
    const tabs = within(screen.getByTestId('friend-tabs'));
    for (const label of ['Online', 'All', 'Pending', 'Blocked']) expect(tabs.getByLabelText(label)).toBeTruthy();
    expect(tabs.queryByLabelText('Add friend')).toBeNull();
    expect(screen.getByLabelText('Add friend')).toBeTruthy();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    useSessionStore.getState().reset();
    useGuildStore.getState().reset();
    useClosedDmStore.setState({ closed: {} });
    usePresenceStore.getState().reset();
    useSessionStore.setState({ status: 'ready', user: ME as never });
    useGuildStore.getState().hydrate([], []);
    usePresenceStore.getState().setMany({ u2: { status: 'online', activities: [] } });
  });

  const people = [rel('u2', 'Pat', RelationshipType.FRIEND), rel('u3', 'Sam', RelationshipType.FRIEND), rel('u4', 'Incoming', RelationshipType.INCOMING), rel('u5', 'Outgoing', RelationshipType.OUTGOING), rel('u6', 'Blocky', RelationshipType.BLOCKED)];

  it('opens from the Friends row of the DM list on Online with the counts on its tabs', async () => {
    await openFriends(people);
    expect(screen).toHavePathname('/friends');
    expect(screen.getByLabelText('Online 1')).toBeTruthy();
    expect(screen.getByLabelText('All 2')).toBeTruthy();
    expect(screen.getByLabelText('Pending 2')).toBeTruthy();
    expect(screen.getByLabelText('Blocked 1')).toBeTruthy();
    expect(screen.getByLabelText('Pat, Online')).toBeTruthy();
    expect(screen.queryByLabelText('Sam, Offline')).toBeNull();
    await fireEvent.press(screen.getByLabelText('All 2'));
    expect(screen.getByLabelText('Sam, Offline')).toBeTruthy();
  });

  it('marks a friend as a favourite from the friend menu', async () => {
    await openFriends(people);
    await fireEvent.press(screen.getByLabelText('Pat, Online'));
    await fireEvent.press(screen.getByText('Add favourite'));
    await waitFor(() => expect(mockApi.setFavouriteFriend).toHaveBeenCalledWith('u2', true));
    expect(await screen.findByText('FAVOURITES - 1')).toBeTruthy();
  });

  it('searches within a tab', async () => {
    await openFriends(people);
    await fireEvent.press(screen.getByLabelText('All 2'));
    await fireEvent.changeText(screen.getByLabelText('Search'), 'sa');
    expect(screen.queryByLabelText('Pat, Online')).toBeNull();
    expect(screen.getByLabelText('Sam, Offline')).toBeTruthy();
  });

  it('accepts and declines incoming requests and cancels outgoing ones', async () => {
    await openFriends(people);
    await fireEvent.press(screen.getByLabelText('Pending 2'));
    await fireEvent.press(screen.getByLabelText('Accept Incoming'));
    expect(mockApi.putRelationship).toHaveBeenCalledWith('u4');
    await fireEvent.press(screen.getByLabelText('Decline Incoming'));
    expect(mockApi.deleteRelationship).toHaveBeenCalledWith('u4');
    await fireEvent.press(screen.getByLabelText('Cancel request to Outgoing'));
    expect(mockApi.deleteRelationship).toHaveBeenCalledWith('u5');
  });

  it('unblocks from the Blocked tab', async () => {
    await openFriends(people);
    await fireEvent.press(screen.getByLabelText('Blocked 1'));
    await fireEvent.press(screen.getByLabelText('Unblock Blocky'));
    expect(mockApi.deleteRelationship).toHaveBeenCalledWith('u6');
  });

  it('messages a friend from their menu', async () => {
    await openFriends(people);
    await fireEvent.press(screen.getByLabelText('Pat, Online'));
    await fireEvent.press(await screen.findByLabelText('Message'));
    expect(mockApi.openPrivateChannel).toHaveBeenCalledWith(['u2']);
    await waitFor(() => expect(screen).toHavePathname('/dms/7000'));
  });

  it('blocks a friend only after confirming, and removes one the same way', async () => {
    await openFriends(people);
    await fireEvent.press(screen.getByLabelText('Pat, Online'));
    await fireEvent.press(await screen.findByLabelText('Block'));
    expect(mockApi.putRelationship).not.toHaveBeenCalled();
    await fireEvent.press(await screen.findByLabelText('Cancel'));
    await fireEvent.press(await screen.findByLabelText('Remove friend'));
    await fireEvent.press(await screen.findAllByLabelText('Remove friend').then((all) => all[all.length - 1]!));
    expect(mockApi.deleteRelationship).toHaveBeenCalledWith('u2');
    expect(mockApi.putRelationship).not.toHaveBeenCalled();
  });

  it('blocks with the blocked relationship type', async () => {
    await openFriends(people);
    await fireEvent.press(screen.getByLabelText('Pat, Online'));
    await fireEvent.press(await screen.findByLabelText('Block'));
    await fireEvent.press((await screen.findAllByLabelText('Block')).at(-1)!);
    expect(mockApi.putRelationship).toHaveBeenCalledWith('u2', { type: RelationshipType.BLOCKED });
  });

  it('opens a friend profile from the menu', async () => {
    await openFriends(people);
    await fireEvent.press(screen.getByLabelText('Pat, Online'));
    await fireEvent.press(await screen.findByLabelText('Profile'));
    await waitFor(() => expect(mockApi.userProfile).toHaveBeenCalledWith('u2'));
  });

  it('shows a request arriving while the page is open', async () => {
    await openFriends([]);
    await fireEvent.press(screen.getByLabelText('Online'));
    await act(async () => useRelationshipStore.getState().upsert(rel('u8', 'Newcomer', RelationshipType.INCOMING)));
    await fireEvent.press(await screen.findByLabelText('Pending 1'));
    expect(screen.getByLabelText('Accept Newcomer')).toBeTruthy();
  });
});

describe('add friend', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSessionStore.getState().reset();
    useGuildStore.getState().reset();
    useSessionStore.setState({ status: 'ready', user: ME as never });
    useGuildStore.getState().hydrate([], []);
  });

  const openAdd = async () => {
    await openFriends([]);
    await fireEvent.press(screen.getByLabelText('Add friend'));
  };

  it('sends a request by username and says so', async () => {
    await openAdd();
    const send = screen.getByLabelText('Send request');
    expect(send.props.accessibilityState.disabled).toBe(true);
    await fireEvent.changeText(screen.getByLabelText('Username'), ' pat ');
    await fireEvent.press(screen.getByLabelText('Send request'));
    expect(mockApi.sendFriendRequest).toHaveBeenCalledWith('pat');
    expect(await screen.findByText('Friend request sent to pat.')).toBeTruthy();
    expect(screen.getByLabelText('Username').props.value).toBe('');
  });

  it('explains a failure in plain words and keeps the name', async () => {
    mockApi.sendFriendRequest.mockRejectedValueOnce(new ApiError(404, 10013, 'Unknown user'));
    await openAdd();
    await fireEvent.changeText(screen.getByLabelText('Username'), 'ghost');
    await fireEvent.press(screen.getByLabelText('Send request'));
    expect(await screen.findByText('We could not find anyone named "ghost". Check the spelling and try again.')).toBeTruthy();
    expect(screen.getByLabelText('Username').props.value).toBe('ghost');
  });

  it('does not alert on a failed request', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockApi.sendFriendRequest.mockRejectedValueOnce(new Error('offline'));
    await openAdd();
    await fireEvent.changeText(screen.getByLabelText('Username'), 'ghost');
    await fireEvent.press(screen.getByLabelText('Send request'));
    expect(await screen.findByText('offline')).toBeTruthy();
    expect(alert).not.toHaveBeenCalled();
    alert.mockRestore();
  });
});

it('holds a friend invite until sign-in and then sends it', async () => {
  const token = 'friend_token_1234567890ABC';
  useSessionStore.setState({ status: 'signedOut' } as never);
  await renderRouter('./app', { initialUrl: `/friend-invite/${token}` });
  expect(await screen.findByText('Sign in to send this friend request.')).toBeTruthy();
  expect(mockApi.useFriendInvite).not.toHaveBeenCalled();
  act(() => useSessionStore.setState({ status: 'ready' } as never));
  await waitFor(() => expect(mockApi.useFriendInvite).toHaveBeenCalledWith(token));
});
