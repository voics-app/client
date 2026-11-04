import type { ExpoConfig } from 'expo/config';
import brand from '../desktop/brand.json';

// Name, URL scheme and bundle id come from brand.json, like desktop. The bundle id is the
// placeholder `appId` until the owner decides the real one (docs#10).
const config: ExpoConfig = {
  name: brand.displayName,
  slug: 'discordy',
  scheme: brand.protocolScheme,
  version: '0.0.1',
  orientation: 'portrait',
  icon: '../desktop/build/icon.png',
  userInterfaceStyle: 'dark',
  backgroundColor: '#111214',
  ios: {
    bundleIdentifier: brand.appId,
    supportsTablet: false,
  },
  android: {
    package: brand.appId,
    adaptiveIcon: { foregroundImage: '../desktop/build/icon.png', backgroundColor: '#111214' },
  },
  plugins: ['expo-router', 'expo-secure-store', 'expo-sqlite'],
  experiments: { typedRoutes: true },
  extra: { apiUrl: brand.apiUrl, gatewayUrl: brand.gatewayUrl },
};

export default config;
