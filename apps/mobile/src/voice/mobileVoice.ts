/** Composition of the mobile voice stack: the core call controller with the phone's microphone, mixer and WebRTC. */
import type { CryptoBridge } from '@discordy/core/application/ports/crypto';
import type { GatewayPort } from '@discordy/core/application/ports/gateway';
import { useVoiceStore } from '@discordy/core/application/stores/voiceStore';
import { DaveSession } from '@discordy/core/application/voice/daveSession';
import { VoiceSession } from '@discordy/core/application/voice/voiceSession';
import type { IceServer } from '@discordy/core/domain/turn';
import { DEFAULT_VIDEO_CODEC } from '@discordy/core/domain/sdp';
import type { SocketFactory } from '@discordy/core/infrastructure/net/socket';
import { AppState } from 'react-native';
import { AudioRoute } from './audioRoute';
import { MobileCallController } from './mobileCallController';
import { MobileMic } from './mobileMic';
import { MobileMixer } from './mobileMixer';
import type { NativeVoice } from './nativeVoice';

export interface MobileVoiceDeps {
  gateway: Pick<GatewayPort, 'send'>;
  native: NativeVoice;
  socketFactory: SocketFactory;
  iceServers: () => IceServer[];
  /** The MLS engine that keys end-to-end encrypted calls; without it such calls are refused. */
  crypto: CryptoBridge | null;
  /** Identity public keys of every device of a user, to remove a departed participant from the media group. */
  identityKeysOf(userId: string): Promise<string[]>;
}

export interface MobileVoice {
  controller: MobileCallController;
  route: AudioRoute;
  /** Stops listening to the call state; for tests and runtime teardown. */
  dispose(): void;
}

export function createMobileVoice({ gateway, native, socketFactory, iceServers, crypto, identityKeysOf }: MobileVoiceDeps): MobileVoice {
  const mic = new MobileMic(() => native.openMicrophone());
  const route = new AudioRoute(native.route);
  const controller = new MobileCallController({
    gateway,
    screenShare: native.screenShare,
    openCamera: (facing) => native.openCamera(facing),
    onBackground: (listener) => {
      const subscription = AppState.addEventListener('change', (state) => {
        if (state === 'background') listener();
      });
      return () => subscription.remove();
    },
    mic,
    mixer: new MobileMixer(),
    createSession: (params) => {
      // One cryptor per call. Without the crypto engine there is none, and an end-to-end encrypted call is refused with a clear error.
      const cryptor = crypto ? native.createCryptor() : null;
      const session = new VoiceSession({
        endpoint: params.endpoint,
        region: params.region,
        serverId: params.serverId,
        userId: params.userId,
        sessionId: params.sessionId,
        token: params.token,
        socketFactory,
        createPeerConnection: () => native.createPeerConnection(iceServers()),
        createStream: (track) => native.createStream(track),
        // VoiceSession's common VP8 default keeps mobile and desktop media compatible.
        preferredVideoCodec: DEFAULT_VIDEO_CODEC,
        ...(cryptor && crypto
          ? {
              cryptor,
              createDave: (send, hooks) =>
                new DaveSession({ groupId: `voice:${params.serverId}`, userId: params.userId, crypto, cryptor, identityKeysOf, send, ...hooks }),
            }
          : {}),
      });
      session.onStatus((status) => {
        if (status === 'closed') cryptor?.dispose();
      });
      session.onLocalLevel((level) => mic.feedLevel(level));
      return session;
    },
  });
  // The platform audio session follows the call: open from the first moment of a join, closed once it is over.
  const stopWatching = useVoiceStore.subscribe((state, previous) => {
    if (state.call.status === previous.call.status) return;
    if (state.call.status === 'idle' || state.call.status === 'failed') route.end();
    else route.begin();
  });
  return {
    controller,
    route,
    dispose: () => {
      stopWatching();
      controller.dispose();
    },
  };
}
