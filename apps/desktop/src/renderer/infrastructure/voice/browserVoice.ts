/** Browser composition of the voice stack and Watch Together (used by the app composition root). */
import type { GatewayPort } from '@discordy/core/application/ports/gateway';
import { createStreamSampler } from './streamSampler';
import { cameraCaptureConstraints } from '@discordy/core/domain/videoPresets';
import type { MediaPeerConnection, MediaStreamLike } from '@discordy/core/application/ports/media';
import { VoiceSession } from '@discordy/core/application/voice/voiceSession';
import { VoiceController, type SessionParams } from '@renderer/application/voice/voiceController';
import { WatchTogetherService } from '@renderer/application/watch/watchTogetherService';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { useLocalPeopleStore } from '@discordy/core/application/stores/localPeopleStore';
import { useVoiceStore } from '@discordy/core/application/stores/voiceStore';
import { createBrowserMicPipeline, createBrowserMixer } from '../audio/browserAudio';
import { browserSocketFactory } from '../net/socket';
import { DaveSession } from '@discordy/core/application/voice/daveSession';
import { FrameCryptor } from './frameCryptor';

export interface BrowserVoiceOptions {
  gateway: Pick<GatewayPort, 'send'>;
  /** `process.platform` value from AppInfo; Windows enables loopback audio for screen share. */
  platform: string;
  /** TURN/STUN servers from the gateway READY payload, read when a session starts (relay fallback when UDP to the SFU fails). */
  iceServers?: () => RTCIceServer[];
  /** Identity public keys of a user's devices, used to remove departed participants from the media group. */
  identityKeysOf?(userId: string): Promise<string[]>;
}

const LEGACY_ENCODED_STREAMS = !('RTCRtpScriptTransform' in globalThis);

function createVoiceSession(
  params: SessionParams,
  identityKeysOf: BrowserVoiceOptions['identityKeysOf'],
  iceServers: BrowserVoiceOptions['iceServers'],
  onSoundboardAudio: (userId: string, stream: MediaStreamLike | null) => void,
): VoiceSession {
  const cryptor = new FrameCryptor();
  const bridge = window.discordy;
  const session = new VoiceSession({
    endpoint: params.endpoint,
    region: params.region,
    serverId: params.serverId,
    userId: params.userId,
    sessionId: params.sessionId,
    token: params.token,
    socketFactory: browserSocketFactory,
    onSoundboardAudio,
    // `encodedInsertableStreams` enables the createEncodedStreams fallback, needed only on Chromium without
    // RTCRtpScriptTransform. With it set, every sender and receiver must be piped (FrameCryptor.bypass for clear calls).
    createPeerConnection: () =>
      new RTCPeerConnection({ bundlePolicy: 'max-bundle', iceServers: iceServers?.() ?? [], ...(LEGACY_ENCODED_STREAMS ? { encodedInsertableStreams: true } : {}) } as RTCConfiguration) as unknown as MediaPeerConnection,
    createStream: (track) => new MediaStream([track as MediaStreamTrack]),
    cryptor,
    createDave: bridge
      ? (send, hooks) =>
          new DaveSession({ groupId: `voice:${params.serverId}`, userId: params.userId, crypto: bridge.crypto, cryptor, identityKeysOf, send, ...hooks })
      : undefined,
  });
  session.onStatus((status) => {
    if (status === 'closed') cryptor.dispose();
  });
  return session;
}

export function createVoiceController(options: BrowserVoiceOptions): VoiceController {
  const bridge = window.discordy;
  const mixer = createBrowserMixer();
  return new VoiceController({
    gateway: options.gateway,
    createSession: (params) => createVoiceSession(params, options.identityKeysOf, options.iceServers, (userId, stream) => {
      if (stream) {
        const muted = userId in useLocalPeopleStore.getState().mutedUsers;
        const volume = useVoiceStore.getState().userVolumes[userId] ?? (muted ? 0 : undefined);
        if (volume !== undefined) mixer.setUserVolume(userId, volume);
      }
      mixer.setSoundboardStream(userId, stream as MediaStream | null);
    }),
    mic: createBrowserMicPipeline(),
    mixer,
    openCamera: (deviceId, preset) =>
      navigator.mediaDevices.getUserMedia({
        video: { ...cameraCaptureConstraints(preset), deviceId: deviceId ? { exact: deviceId } : undefined },
        audio: false,
      }),
    screen: {
      capture: {
        listSources: () => bridge?.capture.listSources() ?? Promise.resolve([]),
        select: (selection) => bridge?.capture.select(selection) ?? Promise.resolve(),
      },
      getDisplayMedia: (constraints) => navigator.mediaDevices.getDisplayMedia(constraints),
      platform: options.platform,
      createSampler: createStreamSampler,
    },
  });
}

export function createWatchTogetherService(gateway: Pick<GatewayPort, 'send' | 'onOp'>): WatchTogetherService {
  return new WatchTogetherService({ gateway, userId: () => useSessionStore.getState().user?.id ?? null });
}
