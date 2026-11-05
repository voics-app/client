/**
 * The one place that loads the native voice modules (react-native-webrtc and react-native-incall-manager).
 * They are required lazily and only in a native build: Expo Go has neither, and importing them there would
 * crash the whole app at startup.
 */
import type { IceServer } from '@discordy/core/domain/turn';
import type { MediaPeerConnection, MediaStreamLike, MediaTrackLike } from '@discordy/core/application/ports/media';
import { isNativeBuild } from '../native/isNativeBuild';

export interface NativeAudioTrack extends MediaTrackLike {
  enabled: boolean;
  /** react-native-webrtc: gain in the range 0 to 10, 1 by default. */
  _setVolume?(volume: number): void;
}

export interface NativeAudioStream extends MediaStreamLike {
  getAudioTracks(): NativeAudioTrack[];
}

/** Routes call audio to the loudspeaker or the earpiece. */
export interface AudioRouteDriver {
  start(): void;
  stop(): void;
  setSpeaker(on: boolean): void;
}

export interface NativeVoice {
  createPeerConnection(iceServers: IceServer[]): MediaPeerConnection;
  createStream(track: MediaTrackLike): MediaStreamLike;
  openMicrophone(): Promise<NativeAudioTrack>;
  route: AudioRouteDriver;
}

export const MICROPHONE_DENIED = 'Microphone access is off. Turn it on for Voics in the iOS Settings app.';

export interface WebRtcModule {
  RTCPeerConnection: new (config: object) => unknown;
  MediaStream: new (tracks: unknown[]) => unknown;
  mediaDevices: { getUserMedia(constraints: object): Promise<NativeAudioStream> };
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
    openMicrophone: async () => {
      let stream: NativeAudioStream;
      try {
        stream = await webrtc.mediaDevices.getUserMedia({ audio: true, video: false });
      } catch {
        throw new Error(MICROPHONE_DENIED);
      }
      const track = stream.getAudioTracks()[0];
      if (!track) throw new Error(MICROPHONE_DENIED);
      return track;
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
    const webrtc = require('react-native-webrtc') as WebRtcModule;
    const inCall = (require('react-native-incall-manager') as { default: InCallManagerModule }).default;
    /* eslint-enable @typescript-eslint/no-require-imports */
    return createNativeVoice(webrtc, inCall);
  } catch {
    return null;
  }
}
