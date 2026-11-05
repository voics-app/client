import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import type { GuildFolder, GuildFull } from '@discordy/core/contracts/rest';
import { addToFolder, createFolder, folderOf, loneServers, removeFromFolder, stepFolder, stepGuild } from '../../src/shell/railEditModel';
import { resetStores, seedServer } from '../support/server';

const one = (id: string): GuildFolder => ({ id: null, name: null, color: null, guild_ids: [id] });
const folder = (id: number, ids: string[]): GuildFolder => ({ id, name: null, color: null, guild_ids: ids });
const ids = (rail: GuildFolder[]) => rail.map((e) => (e.id === null ? e.guild_ids[0] : `f${e.id}:${e.guild_ids.join('+')}`));

describe('rail edit model', () => {
  const rail = [one('a'), folder(1, ['b', 'c']), one('d')];

  it('steps a lone server among the entries and stops at the edges', () => {
    expect(ids(stepGuild(rail, 'a', 1))).toEqual(['f1:b+c', 'a', 'd']);
    expect(ids(stepGuild(rail, 'd', -1))).toEqual(['a', 'd', 'f1:b+c']);
    expect(stepGuild(rail, 'a', -1)).toBe(rail);
    expect(stepGuild(rail, 'd', 1)).toBe(rail);
  });

  it('steps a server inside its folder, not out of it', () => {
    expect(ids(stepGuild(rail, 'b', 1))).toEqual(['a', 'f1:c+b', 'd']);
    expect(stepGuild(rail, 'b', -1)).toBe(rail);
    expect(stepGuild(rail, 'c', 1)).toBe(rail);
  });

  it('steps a folder as a whole', () => {
    expect(ids(stepFolder(rail, 1, -1))).toEqual(['f1:b+c', 'a', 'd']);
    expect(stepFolder(rail, 1, 1).map((e) => e.id)).toEqual([null, null, 1]);
  });

  it('adds a server to a folder, which empties and drops the folder it left if only one remains', () => {
    expect(ids(addToFolder(rail, 'a', 1))).toEqual(['f1:b+c+a', 'd']);
    expect(ids(addToFolder([folder(1, ['b', 'c']), folder(2, ['x', 'y'])], 'b', 2))).toEqual(['c', 'f2:x+y+b']);
  });

  it('takes a server out of its folder to just after it, and a lone leftover reverts to a plain entry', () => {
    expect(ids(removeFromFolder(rail, 'b'))).toEqual(['a', 'c', 'b', 'd']);
    expect(removeFromFolder(rail, 'a')).toBe(rail);
  });

  it('starts a folder with another lone server, which comes first', () => {
    expect(ids(createFolder(rail, 'a', 'd'))).toEqual(['f1:b+c', 'f2:d+a']);
    expect(loneServers(rail, 'a')).toEqual(['d']);
  });

  it('knows which folder holds a server', () => {
    expect(folderOf(rail, 'c')?.id).toBe(1);
    expect(folderOf(rail, 'a')).toBeUndefined();
  });
});

const mockApi = {
  messages: jest.fn(async () => []),
  updateSettings: jest.fn(async (patch: object) => ({ default_delivery_mode: 'standard', ...patch })),
};
const mockSession = { boot: jest.fn(), login: jest.fn(), loginMfa: jest.fn(), logout: jest.fn() };
jest.mock('../../src/runtime', () => ({ getRuntime: () => ({ session: mockSession, gateway: { state: 'idle', resumeNow: jest.fn(), send: jest.fn() }, api: mockApi, apiUrl: 'https://api.test' }) }));

const guild = (id: string, name: string) => ({ id, name, icon: null, owner_id: 'x', roles: [], emojis: [], members: [], channels: [] }) as unknown as GuildFull;

async function openRail() {
  seedServer(0n);
  await renderRouter('./app', { initialUrl: '/' });
  await act(async () => useGuildStore.getState().upsertGuild(guild('g2', 'Chess Club')));
  await screen.findByLabelText('Chess Club');
}

describe('rail menu', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetStores();
  });

  it('moves a server with the long-press menu and saves the new order to the account', async () => {
    await openRail();
    await fireEvent(screen.getByLabelText('Chess Club'), 'longPress');
    await fireEvent.press(await screen.findByLabelText('Move up'));
    await waitFor(() => expect(mockApi.updateSettings).toHaveBeenCalledWith({ guild_folders: expect.any(Array), guild_positions: ['g2', 'g1'] }));
    expect(useGuildStore.getState().rail.map((e) => e.guild_ids[0])).toEqual(['g2', 'g1']);
  });

  it('makes a folder of two servers, then renames it', async () => {
    await openRail();
    await fireEvent(screen.getByLabelText('Chess Club'), 'longPress');
    await fireEvent.press(await screen.findByLabelText('Make a folder with another server'));
    await fireEvent.press((await screen.findAllByLabelText('Home Base')).at(-1)!);
    await waitFor(() => expect(useGuildStore.getState().rail).toHaveLength(1));
    expect(useGuildStore.getState().rail[0]).toMatchObject({ guild_ids: ['g1', 'g2'] });
    await fireEvent(await screen.findByLabelText('Home Base, Chess Club folder'), 'longPress');
    await fireEvent.press(await screen.findByLabelText('Rename or colour folder'));
    await fireEvent.changeText(await screen.findByLabelText('Folder name'), 'Games');
    await fireEvent.press(screen.getByLabelText('Save folder'));
    await waitFor(() => expect(useGuildStore.getState().rail[0]?.name).toBe('Games'));
  });

  it('puts the old order back when saving fails', async () => {
    await openRail();
    mockApi.updateSettings.mockRejectedValueOnce(new Error('offline'));
    await fireEvent(screen.getByLabelText('Chess Club'), 'longPress');
    await fireEvent.press(await screen.findByLabelText('Move up'));
    await waitFor(() => expect(mockApi.updateSettings).toHaveBeenCalled());
    await waitFor(() => expect(useGuildStore.getState().rail.map((e) => e.guild_ids[0])).toEqual(['g1', 'g2']));
  });

  it('ungroups a folder', async () => {
    await openRail();
    await act(async () => useGuildStore.getState().setRail([{ id: 1, name: 'Games', color: null, guild_ids: ['g1', 'g2'] }]));
    await fireEvent(await screen.findByLabelText('Games folder'), 'longPress');
    await fireEvent.press(await screen.findByLabelText('Ungroup folder'));
    await waitFor(() => expect(useGuildStore.getState().rail.map((e) => e.id)).toEqual([null, null]));
  });
});
