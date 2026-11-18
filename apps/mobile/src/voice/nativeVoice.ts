/**
 * The one place that loads the native voice modules (@livekit/react-native-webrtc and react-native-incall-manager).
 * They are required lazily and only in a native build: Expo Go has neither, and importing them there would
 * crash the whole app at startup.
 */
import type { IceServer } from '@discordy/core/domain/turn';
import type { MediaPeerConnection, MediaStreamLike, MediaTrackLike } from '@discordy/core/application/ports/media';
import { isNativeBuild } from '../native/isNativeBuild';
import { MobileFrameCryptor, type FrameCryptorModule } from './mobileFrameCryptor';
import type { ScreenShareDriver } from './mobileScreenShare';
import { loadIosScreenShare } from './nativeScreenShare';

export interface NativeAudioTrack extends MediaTrackLike {
  enabled: boolean;
  /** @livekit/react-native-webrtc: gain in the range 0 to 10, 1 by default. */
  _setVolume?(volume: number): void;
}

export interface NativeAudioStream extends MediaStreamLike {
  getAudioTracks(): NativeAudioTrack[];
}

export interface NativeVideoTrack extends MediaTrackLike {
  enabled: boolean;
  readonly readyState?: string;
  onended?: (() => void) | null;
}

/** A camera stream: toURL() is what a native video view renders. */
export interface NativeVideoStream extends MediaStreamLike {
  getVideoTracks(): NativeVideoTrack[];
  toURL(): string;
}

/** Which camera: the one facing you, or the one on the back. */
export type CameraFacing = 'front' | 'back';

/** Routes call audio to the loudspeaker or the earpiece. */
export interface AudioRouteDriver {
  start(): void;
  stop(): void;
  setSpeaker(on: boolean): void;
}

export interface NativeVoice {
  screenShare?: ScreenShareDriver;
  createPeerConnection(iceServers: IceServer[]): MediaPeerConnection;
  createStream(track: MediaTrackLike): MediaStreamLike;
  openMicrophone(): Promise<NativeAudioTrack>;
  /** Opens the camera (the iOS permission prompt appears on first use). Rejects with CAMERA_DENIED when access is off. */
  openCamera(facing: CameraFacing): Promise<NativeVideoStream>;
  /** A frame cryptor for one end-to-end encrypted call; null when this build has none (then E2EE calls are refused). */
  createCryptor(): MobileFrameCryptor | null;
  route: AudioRouteDriver;
}

export const MICROPHONE_DENIED = 'Microphone access is off. Turn it on for Voics in the iOS Settings app.';

export const CAMERA_DENIED = 'Camera access is off. Turn it on for Voics in the iOS Settings app.';

/** 720p at 30 frames a second: sharp enough for a phone screen and kind to the battery and the data plan. The sender caps the bitrate (core's 720p30 preset). */
const CAMERA_CONSTRAINTS = { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } };

export interface WebRtcModule extends Partial<FrameCryptorModule> {
  RTCPeerConnection: new (config: object) => unknown;
  MediaStream: new (tracks: unknown[]) => unknown;
  mediaDevices: { getUserMedia(constraints: object): Promise<NativeAudioStream | NativeVideoStream>; getDisplayMedia?(): Promise<NativeVideoStream> };
}

export interface InCallManagerModule {
  start(setup?: { media?: 'audio' | 'video'; auto?: boolean }): void;
  stop(): void;
  setForceSpeakerphoneOn(flag: boolean): void;
}

/** Builds the native voice pieces from the two modules; the modules are passed in so tests can fake them. */
export function createNativeVoice(webrtc: WebRtcModule, inCall: InCallManagerModule): NativeVoice {
  return {
    createPeerConnection: (iceServers) => new webrtc.RTCPeerConnection({ bundlePolicy: 'max-bundle', iceServers }) as MediaPeerConnection,
    createStream: (track) => new webrtc.MediaStream([track]) as MediaStreamLike,
    createCryptor: () =>
      webrtc.RTCFrameCryptorFactory && webrtc.RTCFrameCryptorAlgorithm && webrtc.RTCKeyDerivationAlgorithm
        ? new MobileFrameCryptor(webrtc as FrameCryptorModule)
        : null,
    openMicrophone: async () => {
      let stream: NativeAudioStream;
      try {
        stream = (await webrtc.mediaDevices.getUserMedia({ audio: true, video: false })) as NativeAudioStream;
      } catch {
        throw new Error(MICROPHONE_DENIED);
      }
      const track = stream.getAudioTracks()[0];
      if (!track) throw new Error(MICROPHONE_DENIED);
      return track;
    },
    openCamera: async (facing) => {
      let stream: NativeVideoStream;
      try {
        stream = (await webrtc.mediaDevices.getUserMedia({
          audio: false,
          video: { ...CAMERA_CONSTRAINTS, facingMode: facing === 'front' ? 'user' : 'environment' },
        })) as NativeVideoStream;
      } catch {
        throw new Error(CAMERA_DENIED);
      }
      if (!stream.getVideoTracks()[0]) throw new Error(CAMERA_DENIED);
      return stream;
    },
    route: {
      start: () => inCall.start({ media: 'audio', auto: false }),
      stop: () => inCall.stop(),
      setSpeaker: (on) => inCall.setForceSpeakerphoneOn(on),
    },
  };
}

/** The native voice stack, or null where it does not exist (Expo Go) or failed to load. */
export function loadNativeVoice(): NativeVoice | null {
  if (!isNativeBuild) return null;
  try {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const webrtc = require('@livekit/react-native-webrtc') as WebRtcModule;
    const inCall = (require('react-native-incall-manager') as { default: InCallManagerModule }).default;
    /* eslint-enable @typescript-eslint/no-require-imports */
    return { ...createNativeVoice(webrtc, inCall), screenShare: loadIosScreenShare(webrtc.mediaDevices) };
  } catch {
    return null;
  }
}
