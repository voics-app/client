/**
 * The one place that loads expo-notifications. It is required lazily and only in a native iOS or Android build: Expo Go cannot receive remote
 * push (its APNs entitlement and FCM project are Expo's, not ours), and the whole feature stays off there.
 */
import { Linking, Platform } from 'react-native';
import { isNativeBuild } from '../../native/isNativeBuild';
import type { PermissionState } from './pushModel';

export interface NativePush {
  /** Which service issued the device token: `apns` on iPhone, `fcm` on Android. */
  platform: 'apns' | 'fcm';
  /** Android: creates the notification channels (Android 13 shows the permission prompt only once a channel exists). Does nothing on iOS. */
  prepare(): Promise<void>;
  permission(): Promise<PermissionState>;
  /** Shows the system prompt; resolves to the answer. */
  request(): Promise<PermissionState>;
  /** The APNs device token (hex) or the FCM registration token, or null when the system gives none (simulator, no entitlement, no Firebase config). */
  deviceToken(): Promise<string | null>;
  /** The system hands out a new token now and then; returns the unsubscribe. */
  onTokenChange(listener: (token: string) => void): () => void;
  /** A notification was tapped while the app ran or was in the background; `data` is the payload's custom keys. */
  onTap(listener: (data: unknown) => void): () => void;
  /** The notification that launched the app from a closed state, if any. */
  launchedBy(): Promise<unknown | null>;
  /** Decides, per push received while the app is open, whether the system shows it. */
  setForegroundPolicy(decide: (data: unknown) => boolean): void;
  setBadge(count: number): Promise<void>;
  openSystemSettings(): Promise<void>;
}

/** The subset of expo-notifications this app calls, so tests can stand in for it. */
export interface NotificationsModule {
  getPermissionsAsync(): Promise<{ status: string; canAskAgain?: boolean }>;
  requestPermissionsAsync(request?: object): Promise<{ status: string }>;
  getDevicePushTokenAsync(): Promise<{ type: string; data: unknown }>;
  addPushTokenListener(listener: (token: { data: unknown }) => void): { remove(): void };
  addNotificationResponseReceivedListener(listener: (response: { notification: { request: { content: { data: unknown } } } }) => void): { remove(): void };
  getLastNotificationResponse(): { notification: { request: { content: { data: unknown } } } } | null;
  setNotificationHandler(handler: { handleNotification(notification: { request: { content: { data: unknown } } }): Promise<object> } | null): void;
  setBadgeCountAsync(count: number): Promise<boolean>;
  setNotificationChannelAsync?(id: string, channel: { name: string; importance: number; showBadge?: boolean; enableVibrate?: boolean }): Promise<unknown>;
}

/** `AndroidImportance` of expo-notifications: DEFAULT (shown, with sound) and HIGH (heads-up). */
const IMPORTANCE_DEFAULT = 3;
const IMPORTANCE_HIGH = 4;

/**
 * The channels Android needs. `messages` is the default channel of FCM notification messages (`app.config.ts` sets it as the default in the manifest).
 * `calls` is the one the native call module rings on (modules/voics-callkit creates it too, so a call can ring before the app ever ran this code).
 */
export const ANDROID_CHANNELS = [
  { id: 'messages', name: 'Messages', importance: IMPORTANCE_DEFAULT },
  { id: 'calls', name: 'Calls', importance: IMPORTANCE_HIGH },
] as const;

const stateOf = (status: string): PermissionState => (status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined');

export function createNativePush(
  module: NotificationsModule,
  openSettings: () => Promise<void> = () => Linking.openSettings(),
  os: 'ios' | 'android' = Platform.OS === 'android' ? 'android' : 'ios',
): NativePush {
  const prepare = async (): Promise<void> => {
    if (os !== 'android' || !module.setNotificationChannelAsync) return;
    for (const { id, name, importance } of ANDROID_CHANNELS) {
      try {
        await module.setNotificationChannelAsync(id, { name, importance, showBadge: id === 'messages', enableVibrate: true });
      } catch {
        // A channel that cannot be created leaves the system default; push still arrives.
      }
    }
  };
  return {
    platform: os === 'android' ? 'fcm' : 'apns',
    prepare,
    permission: async () => stateOf((await module.getPermissionsAsync()).status),
    request: async () => {
      await prepare();
      return stateOf((await module.requestPermissionsAsync(os === 'ios' ? { ios: { allowAlert: true, allowBadge: true, allowSound: true } } : undefined)).status);
    },
    deviceToken: async () => {
      try {
        const token = await module.getDevicePushTokenAsync();
        return typeof token.data === 'string' && token.data !== '' ? token.data : null;
      } catch {
        return null;
      }
    },
    onTokenChange: (listener) => {
      const subscription = module.addPushTokenListener((token) => {
        if (typeof token.data === 'string' && token.data !== '') listener(token.data);
      });
      return () => subscription.remove();
    },
    onTap: (listener) => {
      const subscription = module.addNotificationResponseReceivedListener((response) => listener(response.notification.request.content.data));
      return () => subscription.remove();
    },
    launchedBy: async () => module.getLastNotificationResponse()?.notification.request.content.data ?? null,
    setForegroundPolicy: (decide) =>
      module.setNotificationHandler({
        handleNotification: async (notification) => {
          const show = decide(notification.request.content.data);
          return { shouldShowBanner: show, shouldShowList: show, shouldPlaySound: false, shouldSetBadge: false };
        },
      }),
    setBadge: async (count) => {
      await module.setBadgeCountAsync(count);
    },
    openSystemSettings: openSettings,
  };
}

/** The native push stack, or null in Expo Go and on any platform but iOS and Android. */
export function loadNativePush(): NativePush | null {
  if (!isNativeBuild || (Platform.OS !== 'ios' && Platform.OS !== 'android')) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return createNativePush(require('expo-notifications') as NotificationsModule);
  } catch {
    return null;
  }
}
