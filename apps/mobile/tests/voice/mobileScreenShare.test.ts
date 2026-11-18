import { useVoiceStore } from '@discordy/core/application/stores/voiceStore';
import { MobileScreenShare } from '../../src/voice/mobileScreenShare';
import { createIosScreenShare } from '../../src/voice/nativeScreenShare';
import type { NativeVideoStream, NativeVideoTrack } from '../../src/voice/nativeVoice';

function fixture() {
  const track: NativeVideoTrack = { kind: 'video', enabled: true, stop: jest.fn(), onended: null };
  const stream: NativeVideoStream = { getVideoTracks: () => [track], getTracks: () => [track], toURL: () => 'screen' };
  const session = { setScreenTrack: jest.fn(async () => undefined) };
  const driver = { open: jest.fn<Promise<NativeVideoStream | null>, []>(async () => stream), cancel: jest.fn() };
  const announce = jest.fn();
  const share = new MobileScreenShare({ driver, session: () => session as never, announce });
  return { track, stream, session, driver, announce, share };
}

beforeEach(() => {
  useVoiceStore.getState().resetCall();
  useVoiceStore.getState().setCall({ status: 'connected' });
});

it('publishes only a consented track through the encrypted session path, with screen state', async () => {
  const { share, track, session, stream } = fixture();
  await share.start();
  expect(session.setScreenTrack).toHaveBeenCalledWith(track, expect.objectContaining({ contentHint: 'detail' }));
  expect(useVoiceStore.getState()).toMatchObject({ selfStream: true, localScreen: stream });
  expect(share.status).toBe('sharing');
  await share.stop();
});

it('does not publish when the system picker is cancelled', async () => {
  const { share, driver, session } = fixture();
  driver.open.mockResolvedValue(null);
  await share.start();
  expect(session.setScreenTrack).not.toHaveBeenCalled();
  expect(useVoiceStore.getState().selfStream).toBe(false);
  expect(share.status).toBe('idle');
});

it('stops a late consent result after leaving, and never publishes it', async () => {
  const { share, driver, stream, track, session } = fixture();
  let consent!: (stream: NativeVideoStream) => void;
  driver.open.mockImplementation(() => new Promise((resolve) => { consent = resolve; }));
  const opening = share.start();
  expect(share.status).toBe('starting');
  await share.stop();
  consent(stream);
  await opening;
  expect(track.stop).toHaveBeenCalled();
  expect(session.setScreenTrack).not.toHaveBeenCalled();
  expect(share.status).toBe('idle');
});

it('turns the share off when ReplayKit ends capture from Control Center', async () => {
  const { share, track, driver, session } = fixture();
  await share.start();
  track.onended?.();
  expect(driver.cancel).toHaveBeenCalled();
  expect(track.stop).toHaveBeenCalled();
  expect(session.setScreenTrack).toHaveBeenLastCalledWith(null);
  expect(useVoiceStore.getState()).toMatchObject({ selfStream: false, localScreen: null });
});

it('stops capture and advertises nothing when encryption attachment fails', async () => {
  const { share, session, track } = fixture();
  session.setScreenTrack.mockRejectedValue(new Error('cryptor failed'));
  await expect(share.start()).rejects.toThrow('cryptor failed');
  expect(track.stop).toHaveBeenCalled();
  expect(useVoiceStore.getState().selfStream).toBe(false);
});

it('protects the same screen track again after reconnect without requesting new consent', async () => {
  const { share, session, driver, track } = fixture();
  await share.start();
  await share.restore(session as never);
  expect(driver.open).toHaveBeenCalledTimes(1);
  expect(session.setScreenTrack).toHaveBeenCalledTimes(2);
  expect(session.setScreenTrack).toHaveBeenLastCalledWith(track, expect.any(Object));
  await share.stop();
});

it('opens the WebRTC socket before showing consent and stops it when dismissed', async () => {
  const { stream, track } = fixture();
  const order: string[] = [];
  const driver = createIosScreenShare(async () => { order.push('socket'); return stream; }, {
    requestBroadcast: async () => { order.push('consent'); return false; }, stopBroadcast: jest.fn(async () => undefined),
  });
  expect(await driver.open()).toBeNull();
  expect(order).toEqual(['socket', 'consent']);
  expect(track.stop).toHaveBeenCalled();
});
