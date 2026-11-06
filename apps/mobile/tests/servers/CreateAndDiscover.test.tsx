import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import type { DiscoveryGuild, DiscoveryPage, GuildFull, GuildTemplate } from '@discordy/core/contracts/rest';
import { resetStores, seedServer } from '../support/server';

const template = (code: string, name: string): GuildTemplate => ({ code, name, description: `${name} space`, usage_count: 0, creator_id: null, creator: null, created_at: '', updated_at: '', source_guild_id: null, serialized_source_guild: { channels: [], roles: [] }, is_dirty: false }) as unknown as GuildTemplate;
const found = (id: string, extra: Partial<DiscoveryGuild> = {}): DiscoveryGuild => ({ id, name: `Server ${id}`, icon: null, description: 'About it', category: 'gaming', tags: ['chess'], approximate_member_count: 1200, approximate_presence_count: 40, ...extra });
const newGuild = { id: 'g2', name: 'My server', icon: null, owner_id: 'u1', roles: [], emojis: [], members: [], channels: [] } as unknown as GuildFull;

const mockApi = {
  messages: jest.fn(async () => []),
  builtinGuildTemplates: jest.fn(async () => [template('builtin-gaming', 'Gaming')]),
  guildTemplate: jest.fn(async (code: string) => template(code, 'Linked')),
  createGuild: jest.fn(async (_b: { name: string }) => newGuild),
  createGuildFromTemplate: jest.fn(async (_c: string, _b: { name: string }) => newGuild),
  discoveryCategories: jest.fn(async () => ['gaming', 'music']),
  discoveryGuilds: jest.fn(async (_q: object): Promise<DiscoveryPage> => ({ guilds: [found('a'), found('b')], total: 3, offset: 0, limit: 24 })),
  joinDiscoveryGuild: jest.fn(async (_id: string) => undefined),
};
const mockSession = { boot: jest.fn(), login: jest.fn(), loginMfa: jest.fn(), logout: jest.fn() };
jest.mock('../../src/runtime', () => ({ getRuntime: () => ({ session: mockSession, gateway: { state: 'idle', resumeNow: jest.fn(), send: jest.fn() }, api: mockApi, apiUrl: 'https://api.test' }) }));

beforeEach(() => {
  jest.clearAllMocks();
  resetStores();
});

async function openAdd(option: string) {
  seedServer(0n);
  await renderRouter('./app', { initialUrl: '/servers/g1' });
  await fireEvent.press(await screen.findByLabelText('Add a server'));
  await fireEvent.press(await screen.findByLabelText(option));
}

describe('create a server', () => {
  it('names an empty server, needing at least two characters, then creates and opens it', async () => {
    await openAdd('Create my own server');
    await fireEvent.press(await screen.findByLabelText('Create My Own'));
    expect(screen.getByLabelText('Create server').props.accessibilityState.disabled).toBe(true);
    await fireEvent.changeText(screen.getByLabelText('Server name'), ' M ');
    expect(screen.getByLabelText('Create server').props.accessibilityState.disabled).toBe(true);
    await fireEvent.changeText(screen.getByLabelText('Server name'), ' My server ');
    await fireEvent.press(screen.getByLabelText('Create server'));
    await waitFor(() => expect(mockApi.createGuild).toHaveBeenCalledWith({ name: 'My server' }));
    await waitFor(() => expect(useUiStore.getState().view).toMatchObject({ kind: 'guild', guildId: 'g2' }));
    expect(useGuildStore.getState().guilds['g2']).toBeTruthy();
  });

  it('creates from a built-in template', async () => {
    await openAdd('Create my own server');
    await fireEvent.press(await screen.findByLabelText('Gaming'));
    await fireEvent.changeText(await screen.findByLabelText('Server name'), 'Night owls');
    await fireEvent.press(screen.getByLabelText('Create server'));
    await waitFor(() => expect(mockApi.createGuildFromTemplate).toHaveBeenCalledWith('builtin-gaming', { name: 'Night owls' }));
  });

  it('previews a pasted template link before naming the server', async () => {
    await openAdd('Create my own server');
    await fireEvent.changeText(await screen.findByLabelText('Have a template link?'), 'https://voics.nl/template/abc-123');
    await fireEvent.press(screen.getByLabelText('Preview template'));
    await waitFor(() => expect(mockApi.guildTemplate).toHaveBeenCalledWith('abc-123'));
    expect(await screen.findByText('Customize your Linked server')).toBeTruthy();
  });

  it('shows the server message and stays when creating fails', async () => {
    mockApi.createGuild.mockRejectedValueOnce(new Error('Too many servers'));
    await openAdd('Create my own server');
    await fireEvent.press(await screen.findByLabelText('Create My Own'));
    await fireEvent.changeText(screen.getByLabelText('Server name'), 'Another');
    await fireEvent.press(screen.getByLabelText('Create server'));
    expect(await screen.findByText('Too many servers')).toBeTruthy();
    expect(useGuildStore.getState().guilds['g2']).toBeUndefined();
  });

  it('still offers an empty server when the templates cannot be loaded', async () => {
    mockApi.builtinGuildTemplates.mockRejectedValueOnce(new Error('offline'));
    await openAdd('Create my own server');
    expect(await screen.findByText('Templates could not be loaded. You can still create your own server.')).toBeTruthy();
    expect(screen.getByLabelText('Create My Own')).toBeTruthy();
  });
});

describe('discover', () => {
  async function openDiscover() {
    seedServer(0n);
    await renderRouter('./app', { initialUrl: '/servers/g1' });
    await fireEvent.press(await screen.findByLabelText('Add a server'));
    await fireEvent.press(await screen.findByLabelText('Discover servers'));
    await screen.findByLabelText('Search servers');
  }

  it('lists public servers with their category, counts and tags', async () => {
    await openDiscover();
    expect(await screen.findByLabelText('Server a')).toBeTruthy();
    expect(screen.getAllByText('Gaming').length).toBeGreaterThan(0);
    expect(screen.getAllByText('#chess').length).toBe(2);
    expect(mockApi.discoveryGuilds).toHaveBeenCalledWith({ limit: 24, offset: 0 });
  });

  it('searches after a pause, filters by category and by tag', async () => {
    await openDiscover();
    await screen.findByLabelText('Server a');
    await fireEvent.changeText(screen.getByLabelText('Search servers'), 'chess');
    await waitFor(() => expect(mockApi.discoveryGuilds).toHaveBeenLastCalledWith({ query: 'chess', limit: 24, offset: 0 }));
    await fireEvent.press(screen.getByLabelText('Category: Music'));
    await waitFor(() => expect(mockApi.discoveryGuilds).toHaveBeenLastCalledWith({ query: 'chess', category: 'music', limit: 24, offset: 0 }));
    await fireEvent.press((await screen.findAllByLabelText('Filter by tag chess'))[0]!);
    await waitFor(() => expect(mockApi.discoveryGuilds).toHaveBeenLastCalledWith({ query: 'chess', category: 'music', tag: 'chess', limit: 24, offset: 0 }));
  });

  it('joins a server, and shows Open for one you are in', async () => {
    await openDiscover();
    await act(async () => useGuildStore.getState().upsertGuild({ ...newGuild, id: 'b', name: 'Server b' } as GuildFull));
    expect(await screen.findByLabelText('Open Server b')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Join Server a'));
    await waitFor(() => expect(mockApi.joinDiscoveryGuild).toHaveBeenCalledWith('a'));
  });

  it('loads the next page from the end of the list', async () => {
    await openDiscover();
    mockApi.discoveryGuilds.mockResolvedValueOnce({ guilds: [found('c')], total: 3, offset: 2, limit: 24 });
    await fireEvent.press(await screen.findByLabelText('Load more'));
    await waitFor(() => expect(mockApi.discoveryGuilds).toHaveBeenLastCalledWith({ limit: 24, offset: 2 }));
    expect(await screen.findByLabelText('Server c')).toBeTruthy();
    expect(screen.queryByLabelText('Load more')).toBeNull();
  });

  it('offers Retry when loading fails', async () => {
    mockApi.discoveryGuilds.mockRejectedValueOnce(new Error('offline'));
    await openDiscover();
    await fireEvent.press(await screen.findByLabelText('Retry'));
    expect(await screen.findByLabelText('Server a')).toBeTruthy();
  });
});
