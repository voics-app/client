/** Browser composition of the voice stack and Watch Together (used by the app composition root). */
import type { GatewayPort } from '@renderer/application/ports/gateway';
import { createStreamSampler } from '@renderer/application/voice/blackFrame';
import { VoiceController, type SessionParams } from '@renderer/application/voice/voiceController';
import { WatchTogetherService } from '@renderer/application/watch/watchTogetherService';
import { useSessionStore } from '@renderer/application/stores/sessionStore';
import { createBrowserMicPipeline, createBrowserMixer } from '../audio/browserAudio';
import { browserSocketFactory } from '../net/socket';
import { DaveSession } from './daveSession';
import { FrameCryptor } from './frameCryptor';
import { VoiceSession } from './voiceSession';

export interface BrowserVoiceOptions {
  gateway: Pick<GatewayPort, 'send'>;
  /** `process.platform` value from AppInfo; Windows enables loopback audio for screen share. */
  platform: string;
  /** Identity public keys of a user's devices, used to remove departed participants from the media group. */
  identityKeysOf?(userId: string): Promise<string[]>;
}

function createVoiceSession(params: SessionParams, identityKeysOf: BrowserVoiceOptions['identityKeysOf']): VoiceSession {
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
    // `encodedInsertableStreams` enables the createEncodedStreams fallback on Chromium without RTCRtpScriptTransform.
    createPeerConnection: () => new RTCPeerConnection({ bundlePolicy: 'max-bundle', encodedInsertableStreams: true } as RTCConfiguration),
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
  return new VoiceController({
    gateway: options.gateway,
    createSession: (params) => createVoiceSession(params, options.identityKeysOf),
    mic: createBrowserMicPipeline(),
    mixer: createBrowserMixer(),
    openCamera: (deviceId) =>
      navigator.mediaDevices.getUserMedia({
        video: { deviceId: deviceId ? { exact: deviceId } : undefined, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
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
