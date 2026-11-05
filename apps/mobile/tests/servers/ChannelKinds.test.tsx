import { fireEvent, screen, within } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { EPHEMERAL_MESSAGE } from '../../src/servers/channelScreenKind';
import { VOICE_UNAVAILABLE } from '../../src/voice/VoiceChannelScreen';
import { resetStores, seedServer, seedVoice } from '../support/server';

const mockApi = { messages: jest.fn(async () => []) };
const mockSession = { boot: jest.fn(), login: jest.fn(), loginMfa: jest.fn(), logout: jest.fn() };
jest.mock('../../src/runtime', () => ({ getRuntime: () => ({ session: mockSession, gateway: { state: 'idle', resumeNow: jest.fn(), send: jest.fn() }, api: mockApi, apiUrl: 'https://api.test' }) }));
jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name, accessibilityLabel }: { name: string; accessibilityLabel?: string }) => <Text accessibilityLabel={accessibilityLabel}>{`icon:${name}`}</Text> };
});

async function openServer() {
  await renderRouter('./app', { initialUrl: '/servers/g1' });
  await screen.findByLabelText('Open #general');
}

describe('channel kinds in the column', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetStores();
    seedServer(0n);
  });

  it('lists voice, ephemeral and forum channels in their category with the desktop icons', async () => {
    seedVoice({ user_id: 'u2' }, { user_id: 'u3', self_mute: true });
    await openServer();
    expect(screen.getByLabelText('Open voice channel lobby')).toBeTruthy();
    expect(screen.getByText('icon:volume-high')).toBeTruthy();
    expect(screen.getByLabelText('Open #ideas')).toBeTruthy();
    expect(screen.getByText('icon:chatbubbles-outline')).toBeTruthy();
    const secret = screen.getByLabelText('Open #secret');
    expect(within(secret).getByLabelText('Ephemeral, end-to-end encrypted')).toBeTruthy();
    expect(within(screen.getByLabelText('Open #general')).queryByLabelText('Ephemeral, end-to-end encrypted')).toBeNull();
  });

  it('shows who is in a voice channel, with their mute state, and the user limit', async () => {
    seedVoice({ user_id: 'u2' }, { user_id: 'u3', self_mute: true });
    await openServer();
    const occupants = screen.getByTestId('occupants-lobby');
    expect(within(occupants).getByLabelText('Pat')).toBeTruthy();
    expect(within(occupants).getByLabelText('Sam, Muted')).toBeTruthy();
    expect(within(occupants).getByText('icon:mic-off')).toBeTruthy();
    expect(screen.getByText('2/4')).toBeTruthy();
  });

  it('shows no occupant list for an empty voice channel', async () => {
    await openServer();
    expect(screen.queryByTestId('occupants-lobby')).toBeNull();
  });

  it('opens a voice channel on a screen with the channel, its people and a plain note that voice is not here yet', async () => {
    seedVoice({ user_id: 'u2' });
    await openServer();
    await fireEvent.press(screen.getByLabelText('Open voice channel lobby'));
    expect(await screen.findByText(VOICE_UNAVAILABLE)).toBeTruthy();
    expect(screen.getByText('In this channel, 1')).toBeTruthy();
    expect(screen.getByLabelText('Pat')).toBeTruthy();
    expect(mockApi.messages).not.toHaveBeenCalled();
  });

  it('opens the text chat of a voice channel from its screen, with the history and a composer', async () => {
    await openServer();
    await fireEvent.press(screen.getByLabelText('Open voice channel lobby'));
    await fireEvent.press(await screen.findByLabelText('Open text chat'));
    expect(await screen.findByLabelText('Message')).toBeTruthy();
    expect(mockApi.messages).toHaveBeenCalledWith('lobby', { limit: 50 });
    expect(screen.queryByText(VOICE_UNAVAILABLE)).toBeNull();
  });

  it('offers no text chat for a voice channel with private delivery', async () => {
    useGuildStore.getState().upsertChannel({ ...useGuildStore.getState().channels['lobby']!, delivery_mode: 'p2p' });
    await openServer();
    await fireEvent.press(screen.getByLabelText('Open voice channel lobby'));
    await screen.findByText(VOICE_UNAVAILABLE);
    expect(screen.queryByLabelText('Open text chat')).toBeNull();
  });

  it('says so when nobody is in the voice channel', async () => {
    await openServer();
    await fireEvent.press(screen.getByLabelText('Open voice channel lobby'));
    expect(await screen.findByText('Nobody is here right now')).toBeTruthy();
  });

  it('opens an ephemeral channel on a plain message, without loading messages', async () => {
    await openServer();
    await fireEvent.press(screen.getByLabelText('Open #secret'));
    expect(await screen.findByText(EPHEMERAL_MESSAGE)).toBeTruthy();
    expect(mockApi.messages).not.toHaveBeenCalled();
  });

  it('opens a forum channel on its list of posts', async () => {
    await openServer();
    await fireEvent.press(screen.getByLabelText('Open #ideas'));
    expect(await screen.findByText('No posts yet.')).toBeTruthy();
  });

  it('lists the channels of every kind in the server order', async () => {
    seedVoice({ user_id: 'u2' });
    await openServer();
    const rows = screen.getAllByRole('button').map((r) => String(r.props.accessibilityLabel)).filter((l) => l.startsWith('Open '));
    expect(rows).toEqual(['Open #general', 'Open #secret', 'Open voice channel lobby', 'Open #ideas']);
  });
});
