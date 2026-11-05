/** Composition of the mobile voice stack: the core call controller with the phone's microphone, mixer and WebRTC. */
import type { GatewayPort } from '@discordy/core/application/ports/gateway';
import { useVoiceStore } from '@discordy/core/application/stores/voiceStore';
import { VoiceCallController } from '@discordy/core/application/voice/voiceCallController';
import { VoiceSession } from '@discordy/core/application/voice/voiceSession';
import type { IceServer } from '@discordy/core/domain/turn';
import type { SocketFactory } from '@discordy/core/infrastructure/net/socket';
import { AudioRoute } from './audioRoute';
import { MobileMic } from './mobileMic';
import { MobileMixer } from './mobileMixer';
import type { NativeVoice } from './nativeVoice';

export interface MobileVoiceDeps {
  gateway: Pick<GatewayPort, 'send'>;
  native: NativeVoice;
  socketFactory: SocketFactory;
  iceServers: () => IceServer[];
}

export interface MobileVoice {
  controller: VoiceCallController;
  route: AudioRoute;
  /** Stops listening to the call state; for tests and runtime teardown. */
  dispose(): void;
}

export function createMobileVoice({ gateway, native, socketFactory, iceServers }: MobileVoiceDeps): MobileVoice {
  const mic = new MobileMic(() => native.openMicrophone());
  const route = new AudioRoute(native.route);
  const controller = new VoiceCallController({
    gateway,
    mic,
    mixer: new MobileMixer(),
    createSession: (params) => {
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
