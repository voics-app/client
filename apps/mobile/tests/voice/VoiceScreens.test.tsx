import { Alert, Linking } from 'react-native';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { useCallStore } from '@discordy/core/application/stores/callStore';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useMessageStore } from '@discordy/core/application/stores/messageStore';
import { useRelationshipStore } from '@discordy/core/application/stores/peopleStores';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { useVoiceStore } from '@discordy/core/application/stores/voiceStore';
import { GatewayOp } from '@discordy/core/contracts/gateway';
import { ChannelType, type Channel, type GuildFull, type User, type VoiceState } from '@discordy/core/contracts/rest';

const mockController = { join: jest.fn(async () => undefined), leave: jest.fn(async () => undefined), toggleMute: jest.fn(), toggleDeaf: jest.fn(), toggleVideo: jest.fn(async () => undefined), switchCamera: jest.fn() };
const mockRoute = { current: 'speaker', subscribe: jest.fn(() => () => undefined), toggle: jest.fn() };
const mockGateway = { state: 'idle', resumeNow: jest.fn(), send: jest.fn() };
const mockApi = { messages: jest.fn(async () => []), ack: jest.fn(async () => undefined) };
let mockVoice: unknown = null;
jest.mock('../../src/runtime', () => ({
  getRuntime: () => ({ session: { boot: jest.fn(), logout: jest.fn() }, gateway: mockGateway, api: mockApi, voice: mockVoice }),
}));

jest.mock('../../src/native/isNativeBuild', () => ({ isNativeBuild: true }));
jest.mock('@livekit/react-native-webrtc', () => {
  const { View } = jest.requireActual('react-native');
  return { RTCView: View };
});

const ME: User = { id: 'u1', username: 'me', global_name: 'Me Myself', avatar: null };
const PAT: User = { id: 'u2', username: 'pat', global_name: 'Pat', avatar: null };
const EVERYONE_VIEW_CONNECT = String((1n << 10n) | (1n << 20n));

const voiceState = (user_id: string, extra: Partial<VoiceState> = {}): VoiceState => ({
  guild_id: 'g1',
  channel_id: 'lounge',
  user_id,
  session_id: 's',
  deaf: false,
  mute: false,
  self_deaf: false,
  self_mute: false,
  self_video: false,
  suppress: false,
  ...extra,
});

function seedGuild() {
  const everyone = { id: 'g1', name: '@everyone', color: 0, hoist: false, position: 0, permissions: EVERYONE_VIEW_CONNECT, managed: false, mentionable: false };
  const guild = {
    id: 'g1',
    name: 'Home Base',
    icon: null,
    owner_id: 'owner',
    roles: [everyone],
    emojis: [],
    members: [{ user: ME, roles: [] }, { user: PAT, roles: [] }],
    channels: [
      { id: 'general', type: ChannelType.GUILD_TEXT, guild_id: 'g1', name: 'general', position: 0, delivery_mode: 'standard' },
      { id: 'lounge', type: ChannelType.GUILD_VOICE, guild_id: 'g1', name: 'Lounge', position: 1, delivery_mode: 'standard' },
    ],
  } as unknown as GuildFull;
  useSessionStore.setState({ status: 'ready', user: ME as never, sessionId: 'sess' });
  useGuildStore.getState().hydrate([guild], []);
}

async function openLounge() {
  await fireEvent.press(await screen.findByLabelText('Open voice channel Lounge'));
  await fireEvent.press(await screen.findByLabelText('Join voice'));
}

const dm = (id: string): Channel => ({ id, type: ChannelType.DM, delivery_mode: 'standard', recipients: [PAT] }) as Channel;

describe('voice screens', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSessionStore.getState().reset();
    useGuildStore.getState().reset();
    useMessageStore.getState().reset();
    useRelationshipStore.getState().hydrate([]);
    useCallStore.setState({ calls: {} });
    useVoiceStore.getState().resetCall();
    useVoiceStore.setState({ states: {}, speaking: {}, selfMute: false, selfDeaf: false, selfVideo: false, localCamera: null, remoteStreams: [], screenSsrcs: {}, watching: [], focusedStream: null });
    mockVoice = { controller: mockController, route: mockRoute };
  });

  it('keeps Expo Go working: a voice channel shows the plain note and no Join button', async () => {
    mockVoice = null;
    seedGuild();
    await renderRouter('./app', { initialUrl: '/servers/g1' });
    await fireEvent.press(await screen.findByLabelText('Open voice channel Lounge'));
    expect(await screen.findByText("Voice isn't in this test version yet")).toBeTruthy();
    expect(screen.queryByLabelText('Join voice')).toBeNull();
    expect(mockController.join).not.toHaveBeenCalled();
  });

  it('joins on opening the voice screen and shows who is here, who speaks and who is muted', async () => {
    seedGuild();
    useVoiceStore.getState().hydrate('g1', [voiceState('u1'), voiceState('u2', { self_mute: true })]);
    useVoiceStore.setState({ speaking: { u1: 0.5 } });
    useVoiceStore.getState().setCall({ status: 'connected', channelId: 'lounge', guildId: 'g1' });
    await renderRouter('./app', { initialUrl: '/servers/g1' });
    await openLounge();
    expect(await screen.findByText('Voice connected')).toBeTruthy();
    expect(mockController.join).toHaveBeenCalledTimes(0);
    expect(screen.getByLabelText('Me Myself, you, speaking')).toBeTruthy();
    expect(screen.getByLabelText('Pat, muted')).toBeTruthy();
    expect(screen.getByText('Me Myself (you)')).toBeTruthy();
  });

  it('joins when it opens while no call is running, and leaves with the red button', async () => {
    seedGuild();
    await renderRouter('./app', { initialUrl: '/servers/g1' });
    await openLounge();
    await waitFor(() => expect(mockController.join).toHaveBeenCalledWith({ guildId: 'g1', channelId: 'lounge' }));
    await fireEvent.press(screen.getByLabelText('Leave voice'));
    expect(mockController.leave).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByLabelText('Leave voice')).toBeNull());
  });

  it('has mute, deafen and an audio route switch', async () => {
    seedGuild();
    await renderRouter('./app', { initialUrl: '/servers/g1' });
    await openLounge();
    await fireEvent.press(await screen.findByLabelText('Mute'));
    await fireEvent.press(screen.getByLabelText('Deafen'));
    await fireEvent.press(screen.getByLabelText('Switch to earpiece'));
    expect(mockController.toggleMute).toHaveBeenCalledTimes(1);
    expect(mockController.toggleDeaf).toHaveBeenCalledTimes(1);
    expect(mockRoute.toggle).toHaveBeenCalledTimes(1);
  });

  it('shows why a call failed', async () => {
    seedGuild();
    useVoiceStore.getState().setCall({ status: 'failed', channelId: 'lounge', error: 'Microphone access is off.' });
    await renderRouter('./app', { initialUrl: '/servers/g1' });
    await openLounge();
    expect(await screen.findByText('Microphone access is off.')).toBeTruthy();
  });

  it('shows a bar with the call on the main screen while connected, to mute, leave or go back', async () => {
    seedGuild();
    useVoiceStore.getState().setCall({ status: 'connected', channelId: 'lounge', guildId: 'g1' });
    await renderRouter('./app', { initialUrl: '/servers/g1' });
    expect(await screen.findByLabelText('Open call, Lounge')).toBeTruthy();
    await fireEvent.press(screen.getAllByLabelText('Leave voice')[0]!);
    expect(mockController.leave).toHaveBeenCalled();
  });

  it('starts a voice call from a direct message without the camera', async () => {
    useSessionStore.setState({ status: 'ready', user: ME as never, sessionId: 'sess' });
    useGuildStore.getState().hydrate([], [dm('1000')]);
    await renderRouter('./app', { initialUrl: '/dms' });
    await fireEvent.press(await screen.findByLabelText('Open Pat'));
    await fireEvent.press(await screen.findByLabelText('Voice call'));
    await waitFor(() => expect(mockController.join).toHaveBeenCalledWith({ guildId: null, channelId: '1000' }));
    await act(async () => useVoiceStore.getState().setCall({ status: 'connected', channelId: '1000', guildId: null }));
    await screen.findByLabelText('Turn camera on');
    expect(mockController.toggleVideo).not.toHaveBeenCalled();
  });

  it('starts a video call from a direct message: joins, and turns the camera on once connected', async () => {
    useSessionStore.setState({ status: 'ready', user: ME as never, sessionId: 'sess' });
    useGuildStore.getState().hydrate([], [dm('1000')]);
    await renderRouter('./app', { initialUrl: '/dms' });
    await fireEvent.press(await screen.findByLabelText('Open Pat'));
    await fireEvent.press(await screen.findByLabelText('Video call'));
    await waitFor(() => expect(mockController.join).toHaveBeenCalledWith({ guildId: null, channelId: '1000' }));
    expect(mockController.toggleVideo).not.toHaveBeenCalled();
    await act(async () => useVoiceStore.getState().setCall({ status: 'connected', channelId: '1000', guildId: null }));
    await waitFor(() => expect(mockController.toggleVideo).toHaveBeenCalledTimes(1));
  });

  describe('video', () => {
    const connect = () => {
      seedGuild();
      useVoiceStore.getState().hydrate('g1', [voiceState('u1'), voiceState('u2')]);
      useVoiceStore.getState().setCall({ status: 'connected', channelId: 'lounge', guildId: 'g1' });
    };
    const fakeStream = (url: string) => ({ toURL: () => url, getTracks: () => [], getVideoTracks: () => [] }) as never;

    it('has a camera button that waits for the call to connect and then toggles the camera', async () => {
      seedGuild();
      useVoiceStore.getState().setCall({ status: 'connecting', channelId: 'lounge', guildId: 'g1' });
      await renderRouter('./app', { initialUrl: '/servers/g1' });
      await openLounge();
      expect((await screen.findByLabelText('Turn camera on')).props.accessibilityState).toMatchObject({ disabled: true });
      await act(async () => useVoiceStore.getState().setCall({ status: 'connected' }));
      await fireEvent.press(screen.getByLabelText('Turn camera on'));
      expect(mockController.toggleVideo).toHaveBeenCalledTimes(1);
    });

    it('shows Turn camera off and a flip button while the camera is on, and flips the camera', async () => {
      connect();
      useVoiceStore.setState({ selfVideo: true, localCamera: fakeStream('mine') });
      await renderRouter('./app', { initialUrl: '/servers/g1' });
      await openLounge();
      expect(await screen.findByLabelText('Turn camera off')).toBeTruthy();
      await fireEvent.press(screen.getByLabelText('Switch to back camera'));
      expect(mockController.switchCamera).toHaveBeenCalledTimes(1);
    });

    it('has no flip button while the camera is off', async () => {
      connect();
      await renderRouter('./app', { initialUrl: '/servers/g1' });
      await openLounge();
      await screen.findByLabelText('Turn camera on');
      expect(screen.queryByLabelText('Switch to back camera')).toBeNull();
    });

    it('shows a one to one call with the other person large and your own small tile', async () => {
      connect();
      useVoiceStore.setState({ selfVideo: true, localCamera: fakeStream('mine'), remoteStreams: [{ userId: 'u2', kind: 'camera', stream: fakeStream('theirs') }] });
      await renderRouter('./app', { initialUrl: '/servers/g1' });
      await openLounge();
      expect(await screen.findByLabelText('Video tile, Pat')).toBeTruthy();
      expect(screen.getByLabelText('Video tile, Me Myself, you')).toBeTruthy();
      expect(screen.getAllByTestId('video-surface').map((v) => v.props.streamURL).sort()).toEqual(['mine', 'theirs']);
      // Only your own front camera is mirrored.
      expect(screen.getAllByTestId('video-surface').find((v) => v.props.streamURL === 'mine')?.props.mirror).toBe(true);
      expect(screen.getAllByTestId('video-surface').find((v) => v.props.streamURL === 'theirs')?.props.mirror).toBe(false);
    });

    it('shows a group as a grid, and a tap enlarges one tile and a second tap returns', async () => {
      seedGuild();
      useVoiceStore.getState().hydrate('g1', [voiceState('u1'), voiceState('u2'), voiceState('u3')]);
      useVoiceStore.getState().setCall({ status: 'connected', channelId: 'lounge', guildId: 'g1' });
      useVoiceStore.setState({ remoteStreams: [{ userId: 'u2', kind: 'camera', stream: fakeStream('theirs') }] });
      await renderRouter('./app', { initialUrl: '/servers/g1' });
      await openLounge();
      const tile = await screen.findByLabelText('Video tile, Pat');
      expect(screen.getAllByLabelText(/^Video tile/)).toHaveLength(3);
      await fireEvent.press(tile);
      expect(useVoiceStore.getState().focusedStream).toBe('u2:main');
      await fireEvent.press(await screen.findByLabelText('Video tile, Pat'));
      expect(useVoiceStore.getState().focusedStream).toBeNull();
    });

    it('offers to watch a screen share instead of showing it', async () => {
      connect();
      useVoiceStore.setState({ screenSsrcs: { 'u2:screen': 7 }, remoteStreams: [{ userId: 'u2', kind: 'screen', stream: fakeStream('screen') }] });
      await renderRouter('./app', { initialUrl: '/servers/g1' });
      await openLounge();
      expect(screen.queryByTestId('video-surface')).toBeNull();
      await fireEvent.press(await screen.findByLabelText("Watch Pat's screen"));
      expect(useVoiceStore.getState().watching).toEqual(['u2:screen']);
      expect(await screen.findByTestId('video-surface')).toBeTruthy();
    });

    it('tells you how to allow the camera when access is off, and opens Settings from the alert', async () => {
      const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
      const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
      mockController.toggleVideo.mockRejectedValueOnce(new Error('Camera access is off. Turn it on for Voics in the iOS Settings app.'));
      connect();
      await renderRouter('./app', { initialUrl: '/servers/g1' });
      await openLounge();
      await fireEvent.press(await screen.findByLabelText('Turn camera on'));
      await waitFor(() => expect(alert).toHaveBeenCalledWith('Camera is off', expect.stringContaining('Settings'), expect.any(Array)));
      const buttons = alert.mock.calls[0]![2]!;
      buttons.find((b) => b.text === 'Open Settings')?.onPress?.();
      expect(openSettings).toHaveBeenCalled();
      alert.mockRestore();
      openSettings.mockRestore();
    });

    it('shows any other camera failure as it is', async () => {
      const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
      mockController.toggleVideo.mockRejectedValueOnce(new Error('The camera produced no video'));
      connect();
      await renderRouter('./app', { initialUrl: '/servers/g1' });
      await openLounge();
      await fireEvent.press(await screen.findByLabelText('Turn camera on'));
      await waitFor(() => expect(alert).toHaveBeenCalledWith('Camera', 'The camera produced no video'));
      alert.mockRestore();
    });
  });

  describe('incoming call', () => {
    const ring = () => {
      useSessionStore.setState({ status: 'ready', user: ME as never, sessionId: 'sess' });
      useGuildStore.getState().hydrate([], [dm('1000')]);
      useCallStore.getState().upsert({ channel_id: '1000', message_id: null, region: 'eu', ringing: ['u1'], voice_states: [voiceState('u2', { guild_id: null, channel_id: '1000' })] });
    };

    it('rings with Accept and Decline over any screen', async () => {
      ring();
      await renderRouter('./app', { initialUrl: '/dms' });
      expect(await screen.findByText('Incoming voice call')).toBeTruthy();
      expect(screen.getAllByText('Pat').length).toBeGreaterThan(0);
    });

    it('declines: stops ringing here and tells the gateway', async () => {
      ring();
      await renderRouter('./app', { initialUrl: '/dms' });
      await fireEvent.press(await screen.findByLabelText('Decline call'));
      expect(mockGateway.send).toHaveBeenCalledWith(GatewayOp.CALL_DECLINE, { channel_id: '1000' });
      expect(useCallStore.getState().calls['1000']?.ringing).toEqual([]);
      await waitFor(() => expect(screen.queryByText('Incoming voice call')).toBeNull());
    });

    it('accepts: stops ringing and opens the call, which joins it', async () => {
      ring();
      await renderRouter('./app', { initialUrl: '/dms' });
      await fireEvent.press(await screen.findByLabelText('Accept call'));
      await waitFor(() => expect(mockController.join).toHaveBeenCalledWith({ guildId: null, channelId: '1000' }));
      expect(useCallStore.getState().calls['1000']?.ringing).toEqual([]);
    });

    it('does not ring in Expo Go, where there is nothing to answer with', async () => {
      mockVoice = null;
      ring();
      await renderRouter('./app', { initialUrl: '/dms' });
      await screen.findByLabelText('Open Pat');
      expect(screen.queryByText('Incoming voice call')).toBeNull();
    });

    it('does not ring for a call you are already in', async () => {
      ring();
      useCallStore.getState().upsert({
        channel_id: '1000',
        message_id: null,
        region: 'eu',
        ringing: ['u1'],
        voice_states: [voiceState('u2', { guild_id: null, channel_id: '1000' }), voiceState('u1', { guild_id: null, channel_id: '1000' })],
      });
      await renderRouter('./app', { initialUrl: '/dms' });
      await screen.findByLabelText('Open Pat');
      await act(async () => undefined);
      expect(screen.queryByText('Incoming voice call')).toBeNull();
    });
  });
});
