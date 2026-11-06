import { Alert } from 'react-native';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { Permission } from '@discordy/core/contracts/permissions';
import { resetStores, seedServer } from '../support/server';

const mockApi = {
  messages: jest.fn(async () => []),
  ack: jest.fn(async (_c: string, _m: string) => undefined),
  deleteChannel: jest.fn(async (_id: string) => undefined),
  updateChannel: jest.fn(async (id: string, patch: object) => ({ id, ...patch })),
};
jest.mock('../../src/runtime', () => ({ getRuntime: () => ({ session: { boot: jest.fn() }, gateway: { state: 'idle', resumeNow: jest.fn(), send: jest.fn() }, api: mockApi, apiUrl: 'https://api.test' }) }));

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  resetStores();
});

describe('long press on a channel in the channel list', () => {
  it('opens the channel menu with Edit channel for someone who may manage channels, and Edit opens its settings', async () => {
    seedServer(Permission.MANAGE_CHANNELS);
    await renderRouter('./app', { initialUrl: '/servers/g1' });
    await fireEvent(await screen.findByLabelText('Open #general'), 'longPress');
    await fireEvent.press(await screen.findByLabelText('Edit channel'));
    expect(await screen.findByLabelText('Channel name')).toBeTruthy();
    expect(screen.getByDisplayValue('general')).toBeTruthy();
  });

  it('deletes the channel after a question in the same sheet', async () => {
    seedServer(Permission.MANAGE_CHANNELS);
    await renderRouter('./app', { initialUrl: '/servers/g1' });
    await fireEvent(await screen.findByLabelText('Open #general'), 'longPress');
    await fireEvent.press(await screen.findByLabelText('Delete channel'));
    expect(mockApi.deleteChannel).not.toHaveBeenCalled();
    await fireEvent.press(await screen.findAllByLabelText('Delete channel').then((all) => all.at(-1)!));
    await waitFor(() => expect(mockApi.deleteChannel).toHaveBeenCalledWith('general'));
    await waitFor(() => expect(useGuildStore.getState().channels['general']).toBeUndefined());
  });

  it('offers mute and notification settings, but no edit or delete, without Manage Channels', async () => {
    seedServer(Permission.MANAGE_GUILD);
    await renderRouter('./app', { initialUrl: '/servers/g1' });
    await fireEvent(await screen.findByLabelText('Open #general'), 'longPress');
    expect(await screen.findByLabelText('Mute channel')).toBeTruthy();
    expect(screen.queryByLabelText('Edit channel')).toBeNull();
    expect(screen.queryByLabelText('Delete channel')).toBeNull();
  });

  it('opens the category sheet on a long press of a category for someone who may manage channels', async () => {
    seedServer(Permission.MANAGE_CHANNELS);
    await renderRouter('./app', { initialUrl: '/servers/g1' });
    await fireEvent(await screen.findByLabelText('Talk category'), 'longPress');
    expect(await screen.findByLabelText('Category name')).toBeTruthy();
  });
});
