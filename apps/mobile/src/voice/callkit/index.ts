import Constants from 'expo-constants';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { useVoiceStore } from '@discordy/core/application/stores/voiceStore';
import { environmentOf } from '../../notifications/push/pushModel';
import { getRuntime } from '../../runtime';
import { acceptCall, declineCall, leaveVoice } from '../voiceActions';
import { CallKitController } from './CallKitController';
import { useCallKitStore } from './callKitStore';
import { loadNativeCallKit } from './nativeCallKit';

let current: CallKitController | null = null;

/** How long an answer given before the app finished starting waits for the session and the gateway; after it the call screen opens anyway and shows its error. */
const READY_TIMEOUT_MS = 15_000;

function whenReady(): Promise<void> {
  const ready = () => useSessionStore.getState().status === 'ready' && useSessionStore.getState().gateway === 'ready';
  if (ready()) return Promise.resolve();
  return new Promise((resolve) => {
    const finish = () => {
      stop();
      clearTimeout(timer);
      resolve();
    };
    const stop = useSessionStore.subscribe(() => {
      if (ready()) finish();
    });
    const timer = setTimeout(finish, READY_TIMEOUT_MS);
  });
}

/** The WebRTC audio session is handed over by CallKit, so media starts when the system says the session is active. */
function audioSession(active: boolean): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { RTCAudioSession } = require('@livekit/react-native-webrtc') as { RTCAudioSession: { audioSessionDidActivate(): void; audioSessionDidDeactivate(): void } };
    if (active) RTCAudioSession.audioSessionDidActivate();
    else RTCAudioSession.audioSessionDidDeactivate();
  } catch {
    // No WebRTC in this build: there is no call audio to hand over.
  }
}

/** The app's one CallKit controller; off (every call does nothing) in Expo Go and wherever the native module does not exist. */
export function getCallKit(): CallKitController {
  current ??= new CallKitController({
    native: loadNativeCallKit(),
    api: {
      registerVoipToken: (body) => getRuntime().api.registerVoipToken(body),
      removeVoipToken: () => getRuntime().api.removeVoipToken(),
    },
    environment: environmentOf(Constants.expoConfig?.extra?.pushEnvironment),
    now: Date.now,
    whenReady,
    accept: acceptCall,
    decline: declineCall,
    hangUp: () => void leaveVoice(),
    isMuted: () => useVoiceStore.getState().selfMute,
    setMuted: (muted) => getRuntime().voice?.controller.setMute(muted),
    audioSession,
    setShown: (channelIds) => useCallKitStore.getState().setShown(channelIds),
  });
  return current;
}
