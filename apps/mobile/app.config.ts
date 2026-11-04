import type { ExpoConfig } from 'expo/config';
import brand from '../desktop/brand.json';

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
  },
  android: {
    package: brand.appId,
    adaptiveIcon: { foregroundImage: '../desktop/build/icon.png', backgroundColor: '#0c0d12' },
  },
  plugins: ['expo-router', 'expo-secure-store', 'expo-sqlite', ['expo-image-picker', { photosPermission: `${brand.displayName} reads a photo only when you choose one, for example as a server icon.` }]],
  experiments: { typedRoutes: true },
  extra: { apiUrl: brand.apiUrl, gatewayUrl: brand.gatewayUrl, eas: { projectId: '3f910372-91d1-4807-93ac-c678167b6c69' } },
};

export default config;
