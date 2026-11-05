import type { ExpoConfig } from 'expo/config';
import brand from '../desktop/brand.json';

const MICROPHONE_USAGE = `Voics uses the microphone so other people can hear you in voice channels and calls.`;
const CAMERA_USAGE = `Voics uses the camera to send your video in calls.`;

// Name, URL scheme and bundle id come from brand.json, like desktop.
const config: ExpoConfig = {
  name: brand.displayName,
  slug: 'voics',
  scheme: brand.protocolScheme,
  owner: 'oussamaelhajoui',
  version: '0.0.1',
  orientation: 'portrait',
  icon: '../desktop/build/icon.png',
  userInterfaceStyle: 'dark',
  backgroundColor: '#0c0d12',
  ios: {
    bundleIdentifier: brand.appId,
    supportsTablet: false,
    infoPlist: {
      NSMicrophoneUsageDescription: MICROPHONE_USAGE,
      NSCameraUsageDescription: CAMERA_USAGE,
      // Keeps a voice call running (audio in and out) when the app is in the background or the screen is locked.
      UIBackgroundModes: ['audio'],
    },
  },
  android: {
    package: brand.appId,
    adaptiveIcon: { foregroundImage: '../desktop/build/icon.png', backgroundColor: '#0c0d12' },
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-sqlite',
    ['expo-image-picker', { photosPermission: `${brand.displayName} reads a photo or video only when you choose one, for example to attach it to a message or as a server icon.`, cameraPermission: `${brand.displayName} uses the camera only when you take a photo or video to send.` }],
    'expo-video',
    'expo-audio',
    // The development client and WebRTC are native: Expo Go ignores both, and the app guards every use (src/native/isNativeBuild.ts).
    'expo-dev-client',
    ['@config-plugins/react-native-webrtc', { microphonePermission: MICROPHONE_USAGE, cameraPermission: CAMERA_USAGE }],
  ],
  experiments: { typedRoutes: true },
  extra: { apiUrl: brand.apiUrl, gatewayUrl: brand.gatewayUrl, eas: { projectId: '3f910372-91d1-4807-93ac-c678167b6c69' } },
};

export default config;
