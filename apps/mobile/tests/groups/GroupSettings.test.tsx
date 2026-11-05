import { Alert } from 'react-native';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useRelationshipStore } from '@discordy/core/application/stores/peopleStores';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { ChannelType, RelationshipType, type Channel, type Relationship, type User } from '@discordy/core/contracts/rest';
import { groupSettingsView } from '../../src/groups/groupModel';

const ME: User = { id: 'u1', username: 'me', global_name: 'Me Myself', avatar: null };
const PAT: User = { id: 'u2', username: 'pat', global_name: 'Pat', avatar: null };
const SAM: User = { id: 'u3', username: 'sam', global_name: 'Sam', avatar: null };
const BOT: User = { id: 'u4', username: 'robo', global_name: null, avatar: null, bot: true };
const friend = (user: User): Relationship => ({ id: user.id, type: RelationshipType.FRIEND, user }) as Relationship;
const group = (extra: Partial<Channel> = {}) => ({ id: '1001', type: ChannelType.GROUP_DM, delivery_mode: 'standard', name: 'Book club', owner_id: 'u1', recipients: [PAT], ...extra }) as unknown as Channel;

describe('groupSettingsView', () => {
  const rels = { u2: friend(PAT), u3: friend(SAM), u4: friend(BOT) };

  it('lists you first, offers friends who are not in the group and not bots, and knows the owner', () => {
    const view = groupSettingsView(group(), ME, rels);
    expect(view.members.map((u) => u.id)).toEqual(['u1', 'u2']);
    expect(view.addable.map((u) => u.id)).toEqual(['u3']);
    expect(view.isOwner).toBe(true);
    expect(view.canChangeMembers).toBe(true);
    expect(groupSettingsView(group({ owner_id: 'u2' }), ME, rels).isOwner).toBe(false);
  });

  it('is full at 25 people and does not let members change in an encrypted group', () => {
    const many = Array.from({ length: 24 }, (_, i) => ({ id: `x${i}`, username: `x${i}`, global_name: null, avatar: null }) as User);
    expect(groupSettingsView(group({ recipients: many }), ME, rels).full).toBe(true);
    expect(groupSettingsView(group({ delivery_mode: 'ephemeral' }), ME, rels).canChangeMembers).toBe(false);
  });
});

const mockApi = {
  messages: jest.fn(async () => []),
  updateChannel: jest.fn(async (id: string, patch: object) => ({ id, ...patch })),
  addGroupRecipient: jest.fn(async (_c: string, _u: string) => undefined),
  removeGroupRecipient: jest.fn(async (_c: string, _u: string) => undefined),
  updateSettings: jest.fn(async (patch: object) => patch),
};
const mockSession = { boot: jest.fn(), login: jest.fn(), loginMfa: jest.fn(), logout: jest.fn() };
jest.mock('../../src/runtime', () => ({ getRuntime: () => ({ session: mockSession, gateway: { state: 'idle', resumeNow: jest.fn(), send: jest.fn() }, api: mockApi, apiUrl: 'https://api.test' }) }));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn(async () => ({ canceled: true })) }));

async function open(channel: Channel, meId = 'u1') {
  useSessionStore.setState({ status: 'ready', user: { ...ME, id: meId } as never });
  useGuildStore.getState().hydrate([], [channel]);
  useRelationshipStore.getState().hydrate([friend(PAT), friend(SAM)]);
  await renderRouter('./app', { initialUrl: '/groups/1001' });
}

describe('group settings', () => {
  let alert: jest.SpyInstance;
  beforeEach(() => {
    jest.clearAllMocks();
    alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    useSessionStore.getState().reset();
    useGuildStore.getState().reset();
  });
  afterEach(() => alert.mockRestore());

  it('renames the group', async () => {
    await open(group());
    await fireEvent.changeText(await screen.findByLabelText('Group name'), ' Readers ');
    await fireEvent.press(screen.getByLabelText('Save name'));
    await waitFor(() => expect(mockApi.updateChannel).toHaveBeenCalledWith('1001', { name: 'Readers' }));
    expect(useGuildStore.getState().channels['1001']?.name).toBe('Readers');
  });

  it('adds a friend to the group', async () => {
    await open(group());
    await fireEvent.press(await screen.findByLabelText('Add Sam'));
    await waitFor(() => expect(mockApi.addGroupRecipient).toHaveBeenCalledWith('1001', 'u3'));
    expect(useGuildStore.getState().channels['1001']?.recipients?.map((u) => u.id)).toEqual(['u2', 'u3']);
  });

  it('lets only the owner remove someone, after a question', async () => {
    await open(group());
    await fireEvent.press(await screen.findByLabelText('Remove Pat'));
    expect(mockApi.removeGroupRecipient).not.toHaveBeenCalled();
    await act(async () => alert.mock.calls.at(-1)![2]!.find((b: { style?: string }) => b.style === 'destructive').onPress());
    expect(mockApi.removeGroupRecipient).toHaveBeenCalledWith('1001', 'u2');
  });

  it('offers a member who is not the owner no Remove button', async () => {
    await open(group({ owner_id: 'u2' }));
    await screen.findByLabelText('Group name');
    expect(screen.queryByLabelText('Remove Pat')).toBeNull();
    expect(screen.getByLabelText('Add Sam')).toBeTruthy();
  });

  it('keeps an encrypted group read-only for members and says why', async () => {
    await open(group({ delivery_mode: 'ephemeral' }));
    expect(await screen.findByText(/end-to-end encrypted/)).toBeTruthy();
    expect(screen.queryByLabelText('Add Sam')).toBeNull();
    expect(screen.queryByLabelText('Remove Pat')).toBeNull();
  });

  it('asks before leaving the group', async () => {
    await open(group());
    await fireEvent.press(await screen.findByLabelText('Leave group'));
    expect(alert.mock.calls.at(-1)![0]).toBe('Leave group DM?');
  });
});
