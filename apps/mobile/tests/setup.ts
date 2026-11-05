// The native key-value store does not exist under Jest; an in-memory one stands in for it.
jest.mock('expo-sqlite/kv-store', () => {
  const data = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItemSync: (key: string) => data.get(key) ?? null,
      setItemSync: (key: string, value: string) => void data.set(key, value),
      removeItemSync: (key: string) => data.delete(key),
    },
  };
});

// Native media modules do not exist under Jest; light stand-ins render the same tree shape.
jest.mock('expo-image', () => {
  const { View } = jest.requireActual('react-native');
  return { Image: View };
});
jest.mock('expo-video', () => {
  const { View } = jest.requireActual('react-native');
  return { VideoView: View, useVideoPlayer: () => ({ play: jest.fn(), pause: jest.fn() }) };
});
jest.mock('expo-audio', () => ({
  useAudioPlayer: () => ({ play: jest.fn(), pause: jest.fn() }),
  useAudioPlayerStatus: () => ({ isLoaded: true, playing: false }),
}));
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true, assets: null })),
  launchCameraAsync: jest.fn(async () => ({ canceled: true, assets: null })),
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: true })),
}));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn(async () => ({ canceled: true, assets: null })) }));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(async () => undefined),
  selectionAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: 'light' },
  NotificationFeedbackType: { Success: 'success', Error: 'error' },
}));

// Jest's default window is 750 x 1334, which counts as a tablet; the tests are written for a phone, and the tablet tests set their own size.
// eslint-disable-next-line @typescript-eslint/no-require-imports
require('react-native').Dimensions.set({ window: { width: 390, height: 844, scale: 3, fontScale: 1 }, screen: { width: 390, height: 844, scale: 3, fontScale: 1 } });

// expo-notifications needs the native module; the push code reaches it only through a native build, and tests stand in a quiet one.
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(async () => ({ status: 'undetermined' })),
  requestPermissionsAsync: jest.fn(async () => ({ status: 'denied' })),
  getDevicePushTokenAsync: jest.fn(async () => ({ type: 'ios', data: '' })),
  addPushTokenListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  getLastNotificationResponse: jest.fn(() => null),
  setNotificationHandler: jest.fn(),
  setBadgeCountAsync: jest.fn(async () => true),
}));
