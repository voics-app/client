/* eslint-disable @typescript-eslint/no-require-imports -- each case loads the module fresh, under its own mocks */
import type * as NativeVoiceModule from '../../src/voice/nativeVoice';
import { CAMERA_DENIED, createNativeVoice, loadNativeVoice, MICROPHONE_DENIED, type InCallManagerModule, type NativeAudioStream, type WebRtcModule } from '../../src/voice/nativeVoice';

function fakeModules(getUserMedia: WebRtcModule['mediaDevices']['getUserMedia']) {
  const created: { config: object }[] = [];
  const webrtc: WebRtcModule = {
    RTCPeerConnection: class {
      constructor(config: object) {
        created.push({ config });
      }
    },
    MediaStream: class {
      constructor(readonly tracks: unknown[]) {}
    },
    mediaDevices: { getUserMedia },
  };
  const inCall: InCallManagerModule = { start: jest.fn(), stop: jest.fn(), setForceSpeakerphoneOn: jest.fn() };
  return { webrtc, inCall, created };
}

describe('createNativeVoice', () => {
  it('builds a bundled peer connection with the given ice servers', () => {
    const { webrtc, inCall, created } = fakeModules(async () => ({}) as NativeAudioStream);
    createNativeVoice(webrtc, inCall).createPeerConnection([{ urls: 'stun:s.test:3478' }]);
    expect(created[0]?.config).toEqual({ bundlePolicy: 'max-bundle', iceServers: [{ urls: 'stun:s.test:3478' }] });
  });

  it('wraps a track in a stream', () => {
    const { webrtc, inCall } = fakeModules(async () => ({}) as NativeAudioStream);
    const track = { kind: 'audio', stop: jest.fn() };
    const stream = createNativeVoice(webrtc, inCall).createStream(track) as unknown as { tracks: unknown[] };
    expect(stream.tracks).toEqual([track]);
  });

  it('opens an audio-only microphone and returns its track', async () => {
    const track = { kind: 'audio', enabled: true, stop: jest.fn() };
    const getUserMedia = jest.fn(async () => ({ getAudioTracks: () => [track], getTracks: () => [track], getVideoTracks: () => [] }));
    const { webrtc, inCall } = fakeModules(getUserMedia);
    expect(await createNativeVoice(webrtc, inCall).openMicrophone()).toBe(track);
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true, video: false });
  });

  it('says how to turn the microphone on when access is refused or there is no track', async () => {
    const refused = fakeModules(async () => {
      throw new Error('NotAllowedError');
    });
    await expect(createNativeVoice(refused.webrtc, refused.inCall).openMicrophone()).rejects.toThrow(MICROPHONE_DENIED);
    const empty = fakeModules(async () => ({ getAudioTracks: () => [], getTracks: () => [], getVideoTracks: () => [] }));
    await expect(createNativeVoice(empty.webrtc, empty.inCall).openMicrophone()).rejects.toThrow(MICROPHONE_DENIED);
  });

  it('drives the audio session through the in-call manager', () => {
    const { webrtc, inCall } = fakeModules(async () => ({}) as NativeAudioStream);
    const { route } = createNativeVoice(webrtc, inCall);
    route.start();
    route.setSpeaker(false);
    route.stop();
    expect(inCall.start).toHaveBeenCalledWith({ media: 'audio', auto: false });
    expect(inCall.setForceSpeakerphoneOn).toHaveBeenCalledWith(false);
    expect(inCall.stop).toHaveBeenCalled();
  });
});

describe('loadNativeVoice', () => {
  afterEach(() => jest.resetModules());

  it('returns null in Expo Go without touching the native modules', () => {
    jest.resetModules();
    jest.doMock('expo-constants', () => ({ __esModule: true, default: { executionEnvironment: 'storeClient' }, ExecutionEnvironment: { StoreClient: 'storeClient' } }));
    const load = jest.fn(() => {
      throw new Error('native module touched');
    });
    jest.doMock('@livekit/react-native-webrtc', load);
    jest.doMock('react-native-incall-manager', load);
    const { loadNativeVoice: loadInGo } = require('../../src/voice/nativeVoice') as typeof NativeVoiceModule;
    expect(loadInGo()).toBeNull();
    expect(load).not.toHaveBeenCalled();
  });

  it('builds the voice stack in a development build', () => {
    jest.resetModules();
    jest.doMock('expo-constants', () => ({ __esModule: true, default: { executionEnvironment: 'bare' }, ExecutionEnvironment: { StoreClient: 'storeClient' } }));
    jest.doMock('@livekit/react-native-webrtc', () => ({ RTCPeerConnection: class {}, MediaStream: class {}, mediaDevices: { getUserMedia: jest.fn() } }));
    jest.doMock('react-native-incall-manager', () => ({ __esModule: true, default: { start: jest.fn(), stop: jest.fn(), setForceSpeakerphoneOn: jest.fn() } }));
    const { loadNativeVoice: loadInBuild } = require('../../src/voice/nativeVoice') as typeof NativeVoiceModule;
    expect(loadInBuild()).not.toBeNull();
  });

  it('returns null rather than crashing when a native module is missing from the build', () => {
    jest.resetModules();
    jest.doMock('expo-constants', () => ({ __esModule: true, default: { executionEnvironment: 'bare' }, ExecutionEnvironment: { StoreClient: 'storeClient' } }));
    jest.doMock('@livekit/react-native-webrtc', () => {
      throw new Error('Native module WebRTCModule not found');
    });
    const { loadNativeVoice: loadBroken } = require('../../src/voice/nativeVoice') as typeof NativeVoiceModule;
    expect(loadBroken()).toBeNull();
  });

  it('is exported for the runtime', () => {
    expect(typeof loadNativeVoice).toBe('function');
  });
});

describe('createNativeVoice cryptor', () => {
  it('builds a frame cryptor when the module has the frame cryptor classes, and none otherwise', () => {
    const { webrtc, inCall } = fakeModules(async () => ({}) as NativeAudioStream);
    expect(createNativeVoice(webrtc, inCall).createCryptor()).toBeNull();
    const withCryptor: WebRtcModule = {
      ...webrtc,
      RTCFrameCryptorFactory: {} as never,
      RTCFrameCryptorAlgorithm: { kAesGcm: 0 },
      RTCKeyDerivationAlgorithm: { HKDF: 1 },
    };
    const cryptor = createNativeVoice(withCryptor, inCall).createCryptor();
    expect(cryptor).not.toBeNull();
    expect(cryptor?.gated).toBe(true);
  });
});

describe('createNativeVoice camera', () => {
  const track = { kind: 'video', enabled: true, stop: jest.fn(), _switchCamera: jest.fn() };
  const stream = { getVideoTracks: () => [track], getTracks: () => [track], toURL: () => 'url' };

  it('opens a video-only camera of the facing asked for, at 720p30 ideal', async () => {
    const getUserMedia = jest.fn(async () => stream as never);
    const { webrtc, inCall } = fakeModules(getUserMedia);
    const voice = createNativeVoice(webrtc, inCall);
    expect(await voice.openCamera('front')).toBe(stream);
    expect(getUserMedia).toHaveBeenLastCalledWith({ audio: false, video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 }, facingMode: 'user' } });
    await voice.openCamera('back');
    expect(getUserMedia).toHaveBeenLastCalledWith({ audio: false, video: expect.objectContaining({ facingMode: 'environment' }) });
  });

  it('says how to turn the camera on when access is refused or there is no track', async () => {
    const refused = fakeModules(async () => {
      throw new Error('NotAllowedError');
    });
    await expect(createNativeVoice(refused.webrtc, refused.inCall).openCamera('front')).rejects.toThrow(CAMERA_DENIED);
    const empty = fakeModules(async () => ({ getVideoTracks: () => [], getTracks: () => [], toURL: () => '' }) as never);
    await expect(createNativeVoice(empty.webrtc, empty.inCall).openCamera('front')).rejects.toThrow(CAMERA_DENIED);
  });
});
