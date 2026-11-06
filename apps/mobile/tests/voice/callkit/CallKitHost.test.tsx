import { act, render } from '@testing-library/react-native';
import { useCallStore } from '@discordy/core/application/stores/callStore';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { useVoiceStore } from '@discordy/core/application/stores/voiceStore';
import { ChannelType, type Channel, type User } from '@discordy/core/contracts/rest';
import { CallKitHost } from '../../../src/voice/callkit/CallKitHost';
import type { CallSnapshot } from '../../../src/voice/callkit/callKitModel';

const mockController = { attach: jest.fn(), detach: jest.fn(), signedInStart: jest.fn(async () => undefined), signedOut: jest.fn(), update: jest.fn() };
jest.mock('../../../src/voice/callkit/index', () => ({ getCallKit: () => mockController }));

const ME: User = { id: 'u1', username: 'me', global_name: null, avatar: null };
const PAT: User = { id: 'u2', username: 'pat', global_name: 'Pat', avatar: null };
const dm = { id: '10', type: ChannelType.DM, delivery_mode: 'standard', recipients: [PAT] } as Channel;

const lastSnapshot = (): CallSnapshot => mockController.update.mock.calls.at(-1)![0] as CallSnapshot;

describe('CallKitHost', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSessionStore.getState().reset();
    useGuildStore.getState().reset();
    useCallStore.setState({ calls: {} });
    useVoiceStore.getState().resetCall();
    useVoiceStore.setState({ selfMute: false });
  });

  it('listens from launch and stops listening when it goes away', async () => {
    const { unmount } = await render(<CallKitHost />);
    expect(mockController.attach).toHaveBeenCalledTimes(1);
    await unmount();
    expect(mockController.detach).toHaveBeenCalledTimes(1);
  });

  it('starts when the session is ready and ends every system call at sign-out', async () => {
    await render(<CallKitHost />);
    expect(mockController.signedOut).toHaveBeenCalled();
    expect(mockController.signedInStart).not.toHaveBeenCalled();
    await act(async () => useSessionStore.setState({ status: 'ready', user: ME as never }));
    expect(mockController.signedInStart).toHaveBeenCalledTimes(1);
    mockController.signedOut.mockClear();
    await act(async () => useSessionStore.getState().reset());
    expect(mockController.signedOut).toHaveBeenCalledTimes(1);
  });

  it('hands the controller the calls ringing for me and the DM call I am in', async () => {
    useGuildStore.getState().hydrate([], [dm]);
    await render(<CallKitHost />);
    await act(async () => useSessionStore.setState({ status: 'ready', user: ME as never, gateway: 'ready' }));
    await act(async () =>
      useCallStore.getState().upsert({
        channel_id: '10',
        message_id: null,
        region: 'eu',
        ringing: ['u1'],
        voice_states: [{ guild_id: null, channel_id: '10', user_id: 'u2', session_id: 's', deaf: false, mute: false, self_deaf: false, self_mute: false, self_video: false, suppress: false }],
      }),
    );
    expect(lastSnapshot()).toMatchObject({ signedIn: true, ringing: [{ channelId: '10', callerName: 'Pat', isPrivate: false }], active: null });
    expect(lastSnapshot().gatewayReadyAt).not.toBeNull();

    await act(async () => {
      useVoiceStore.getState().setCall({ status: 'connected', channelId: '10', guildId: null });
      useVoiceStore.setState({ selfMute: true });
    });
    expect(lastSnapshot()).toMatchObject({ active: { channelId: '10', connected: true }, selfMute: true });
  });

  it('has no gateway time while the gateway is not ready', async () => {
    await render(<CallKitHost />);
    await act(async () => useSessionStore.setState({ status: 'ready', user: ME as never, gateway: 'connecting' }));
    expect(lastSnapshot().gatewayReadyAt).toBeNull();
  });
});
