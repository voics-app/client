/**
 * The one place that loads the VoicsCallKit Expo module (modules/voics-callkit: CallKit and PushKit on iOS; Telecom, a full-screen incoming-call
 * notification and the FCM call push on Android). It is loaded lazily and only in a native iOS or Android build: Expo Go has no such module, and
 * without it calls ring only while the app is open, in the app's own call card.
 */
import { Platform } from 'react-native';
import { isNativeBuild } from '../../native/isNativeBuild';

/** What the native side reports. `end` reasons: `timeout` (nobody answered), `reset` (the system dropped every call), `hangup` and `decline` (the person, in the system UI). */
export type CallKitEvent =
  | { type: 'token'; token: string | null }
  | { type: 'incoming'; channelId: string; private: boolean }
  | { type: 'answer'; channelId: string }
  | { type: 'end'; channelId: string; reason: 'timeout' | 'reset' | 'hangup' | 'decline' }
  | { type: 'mute'; channelId: string; muted: boolean }
  | { type: 'audio'; active: boolean };

/** `local` is the person leaving from inside the app; the rest say how the call ended on the far side. */
export type CallEndReason = 'local' | 'unanswered' | 'answeredElsewhere' | 'declinedElsewhere' | 'failed' | 'remoteEnded';

export interface NativeCallKit {
  onEvent(listener: (event: CallKitEvent) => void): () => void;
  /** The PushKit token (hex) the system gave this install, or null before it has. Always null on Android: calls ring through the FCM token registered as the push token. */
  voipToken(): Promise<string | null>;
  /** Shows a call ringing in the system UI; false when the system refused it (Do Not Disturb) or it is already shown. */
  reportIncoming(call: { channelId: string; callerName: string | null; isPrivate: boolean; ringSeconds: number }): Promise<boolean>;
  /** Shows a call the person started or joined in the system UI. */
  startOutgoing(channelId: string, name: string | null): Promise<boolean>;
  reportConnected(channelId: string): Promise<void>;
  endCall(channelId: string, reason: CallEndReason): Promise<void>;
  setMuted(channelId: string, muted: boolean): Promise<void>;
}

/** The module as Swift and Kotlin expose it (modules/voics-callkit/ios/VoicsCallKitModule.swift, android/.../VoicsCallKitModule.kt): the same functions and one event stream. */
export interface VoicsCallKitModule {
  addListener(event: 'onCallEvent', listener: (event: unknown) => void): { remove(): void };
  voipToken(): Promise<string | null>;
  reportIncoming(channelId: string, callerName: string | null, isPrivate: boolean, ringSeconds: number): Promise<boolean>;
  startOutgoing(channelId: string, name: string | null): Promise<boolean>;
  reportConnected(channelId: string): Promise<void>;
  endCall(channelId: string, reason: string): Promise<void>;
  setMuted(channelId: string, muted: boolean): Promise<void>;
}

const END_REASONS = new Set(['timeout', 'reset', 'hangup', 'decline']);

/** Reads one native event; anything unexpected is dropped rather than trusted. */
export function parseCallKitEvent(raw: unknown): CallKitEvent | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const event = raw as Record<string, unknown>;
  const channelId = typeof event.channelId === 'string' && event.channelId !== '' ? event.channelId : null;
  switch (event.type) {
    case 'token':
      return { type: 'token', token: typeof event.token === 'string' && event.token !== '' ? event.token : null };
    case 'incoming':
      return channelId ? { type: 'incoming', channelId, private: event.private !== false } : null;
    case 'answer':
      return channelId ? { type: 'answer', channelId } : null;
    case 'end':
      return channelId && typeof event.reason === 'string' && END_REASONS.has(event.reason) ? { type: 'end', channelId, reason: event.reason as 'timeout' | 'reset' | 'hangup' | 'decline' } : null;
    case 'mute':
      return channelId && typeof event.muted === 'boolean' ? { type: 'mute', channelId, muted: event.muted } : null;
    case 'audio':
      return typeof event.active === 'boolean' ? { type: 'audio', active: event.active } : null;
    default:
      return null;
  }
}

export function createNativeCallKit(module: VoicsCallKitModule): NativeCallKit {
  return {
    onEvent: (listener) => {
      const subscription = module.addListener('onCallEvent', (raw) => {
        const event = parseCallKitEvent(raw);
        if (event) listener(event);
      });
      return () => subscription.remove();
    },
    voipToken: () => module.voipToken(),
    reportIncoming: ({ channelId, callerName, isPrivate, ringSeconds }) => module.reportIncoming(channelId, callerName, isPrivate, ringSeconds),
    startOutgoing: (channelId, name) => module.startOutgoing(channelId, name),
    reportConnected: (channelId) => module.reportConnected(channelId),
    endCall: (channelId, reason) => module.endCall(channelId, reason),
    setMuted: (channelId, muted) => module.setMuted(channelId, muted),
  };
}

/** CallKit and PushKit (iOS) or Telecom (Android), or null in Expo Go, on any other platform, and in a build without the module. */
export function loadNativeCallKit(): NativeCallKit | null {
  if (!isNativeBuild || (Platform.OS !== 'ios' && Platform.OS !== 'android')) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { requireOptionalNativeModule } = require('expo') as { requireOptionalNativeModule<T>(name: string): T | null };
    const module = requireOptionalNativeModule<VoicsCallKitModule>('VoicsCallKit');
    return module ? createNativeCallKit(module) : null;
  } catch {
    return null;
  }
}
