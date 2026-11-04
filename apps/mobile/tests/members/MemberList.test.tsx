import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { GatewayOp } from '@discordy/core/contracts/gateway';
import { ChannelType, type Channel } from '@discordy/core/contracts/rest';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { PAT, resetStores, seedServer, seedVoice } from '../support/server';

const dm = { id: '5000', type: ChannelType.DM, delivery_mode: 'standard', recipients: [PAT] } as unknown as Channel;
const mockApi = {
  messages: jest.fn(async () => []),
  userProfile: jest.fn(async (id: string) => ({ user: { id, username: 'pat', global_name: 'Pat', avatar: null, bio: 'Plays chess' }, mutual_guilds: [], mutual_friends: [] })),
  openPrivateChannel: jest.fn(async (_ids: string[]) => dm),
};
const mockGateway = { state: 'idle', resumeNow: jest.fn(), send: jest.fn() };
const mockSession = { boot: jest.fn(), login: jest.fn(), loginMfa: jest.fn(), logout: jest.fn() };
jest.mock('../../src/runtime', () => ({ getRuntime: () => ({ session: mockSession, gateway: mockGateway, api: mockApi, apiUrl: 'https://api.test' }) }));
jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name, accessibilityLabel }: { name: string; accessibilityLabel?: string }) => <Text accessibilityLabel={accessibilityLabel}>{`icon:${name}`}</Text> };
});

async function openMembers() {
  await renderRouter('./app', { initialUrl: '/servers/g1' });
  await fireEvent.press(await screen.findByLabelText('Open #general'));
  await fireEvent.press(await screen.findByLabelText('Member list'));
  await screen.findByLabelText('Search members');
}

describe('member list', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetStores();
    seedServer(0n);
  });

  it('puts a members button in the header of a server channel and opens that server list', async () => {
    await openMembers();
    expect(screen).toHavePathname('/servers/g1/members');
  });

  it('asks the gateway for the members and their presence', async () => {
    await openMembers();
    expect(mockGateway.send).toHaveBeenCalledWith(GatewayOp.REQUEST_GUILD_MEMBERS, { guild_id: 'g1', query: '', limit: 100, presences: true, nonce: 'members-g1' });
  });

  it('groups people by hoisted role, then online, then offline, with status and activity', async () => {
    await openMembers();
    expect(screen.getByLabelText('Mods 1')).toBeTruthy();
    expect(screen.getByLabelText('Online 1')).toBeTruthy();
    expect(screen.getByLabelText('Offline 1')).toBeTruthy();
    expect(screen.getByLabelText('Sam, idle')).toBeTruthy();
    expect(screen.getByLabelText('Pat, online')).toBeTruthy();
    expect(screen.getByLabelText('Me Myself, offline')).toBeTruthy();
    expect(screen.getByText('Playing Chess')).toBeTruthy();
    expect(screen.getByTestId('status-online')).toBeTruthy();
    expect(screen.getByTestId('status-idle')).toBeTruthy();
  });

  it('collapses a group from its header', async () => {
    await openMembers();
    await fireEvent.press(screen.getByLabelText('Offline 1'));
    expect(screen.queryByLabelText('Me Myself, offline')).toBeNull();
    expect(screen.getByLabelText('Pat, online')).toBeTruthy();
  });

  it('marks a member who is in a voice channel', async () => {
    seedVoice({ user_id: 'u2' });
    await openMembers();
    expect(screen.getByLabelText('In voice')).toBeTruthy();
  });

  it('searches the loaded members and asks the server for more after a pause', async () => {
    await openMembers();
    await fireEvent.changeText(screen.getByLabelText('Search members'), 'pa');
    expect(screen.getByLabelText('Search results 1')).toBeTruthy();
    expect(screen.queryByLabelText('Sam, idle')).toBeNull();
    await waitFor(() => expect(mockGateway.send).toHaveBeenCalledWith(GatewayOp.REQUEST_GUILD_MEMBERS, expect.objectContaining({ query: 'pa', nonce: 'msearch-g1' })));
  });

  it('opens a profile sheet with roles and a Message button that opens the DM', async () => {
    await openMembers();
    await fireEvent.press(screen.getByLabelText('Pat, online'));
    expect(await screen.findByText('Regulars')).toBeTruthy();
    expect(screen.getByText('Member since')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Message'));
    await waitFor(() => expect(mockApi.openPrivateChannel).toHaveBeenCalledWith(['u2']));
    await waitFor(() => expect(screen).toHavePathname('/dms/5000'));
    expect(useGuildStore.getState().channels['5000']).toBeTruthy();
  });

  it('offers no Message button on your own profile', async () => {
    await openMembers();
    await fireEvent.press(screen.getByLabelText('Me Myself, offline'));
    expect(await screen.findByLabelText('Close profile')).toBeTruthy();
    expect(screen.queryByLabelText('Message')).toBeNull();
  });
});
