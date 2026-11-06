import type { ExpoConfig } from 'expo/config';
import brand from '../desktop/brand.json';

const MICROPHONE_USAGE = `Voics uses the microphone so other people can hear you in voice channels and calls.`;
const CAMERA_USAGE = `Voics uses the camera to send your video in calls.`;

// Which APNs host this build's device tokens belong to. A development build (EAS profile `development`, or a local `expo run:ios`) is signed for the
// sandbox; preview and store builds use production. The app reports it with its token, and the notifier tries the other host once if a token is
// refused (an ad-hoc build can carry either kind), so a wrong guess here costs a retry, not a lost push.
const pushEnvironment: 'sandbox' | 'production' = ['preview', 'production'].includes(process.env.EAS_BUILD_PROFILE ?? '') ? 'production' : 'sandbox';

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
    supportsTablet: true,
    // iPad stays in portrait like the phone (the app is portrait only), which Apple accepts only for an app that opts out of Split View and Slide Over.
    requireFullScreen: true,
    infoPlist: {
      // The owner's answer to Apple: standard encryption only. See docs runbooks/app-store-privacy.md.
      ITSAppUsesNonExemptEncryption: false,
      NSMicrophoneUsageDescription: MICROPHONE_USAGE,
      NSCameraUsageDescription: CAMERA_USAGE,
      // audio keeps a voice call running (audio in and out) when the app is in the background or the screen is locked. voip lets PushKit wake the app for
      // an incoming call, which it must report to CallKit at once (modules/voics-callkit). No App ID capability belongs to either; the APNs key that sends the
      // alert pushes also sends VoIP pushes (topic <bundle id>.voip).
      UIBackgroundModes: ['audio', 'voip'],
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
    // Adds the aps-environment entitlement for remote push. Expo Go ignores plugins.
    ['expo-notifications', { mode: pushEnvironment === 'sandbox' ? 'development' : 'production' }],
    'expo-audio',
    // The development client and WebRTC are native: Expo Go ignores both, and the app guards every use (src/native/isNativeBuild.ts).
    'expo-dev-client',
    ['@config-plugins/react-native-webrtc', { microphonePermission: MICROPHONE_USAGE, cameraPermission: CAMERA_USAGE }],
  ],
  experiments: { typedRoutes: true },
  extra: { apiUrl: brand.apiUrl, gatewayUrl: brand.gatewayUrl, pushEnvironment, eas: { projectId: '3f910372-91d1-4807-93ac-c678167b6c69' } },
};

export default config;
