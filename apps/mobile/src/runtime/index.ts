import Constants from 'expo-constants';
import { uuid } from 'expo';
import { Platform } from 'react-native';
import { expoSecureBackend } from '../adapters/expoSecureBackend';
import { createSecureSessionVault } from '../adapters/secureSessionVault';
import { nativeSocketFactory } from '../adapters/socket';
import { uploadWithProgress } from '../adapters/xhrUpload';
import { BRAND } from '../brand';
import { loadNativePrivacy } from '../privacy/nativePrivacy';
import { loadNativePush } from '../notifications/push/nativePush';
import { createMobileVoice } from '../voice/mobileVoice';
import { loadNativeVoice } from '../voice/nativeVoice';
import { createRuntime, type MobileRuntime } from './createRuntime';

let current: MobileRuntime | null = null;

function extra(name: 'apiUrl' | 'gatewayUrl'): string {
  const value: unknown = Constants.expoConfig?.extra?.[name];
  if (typeof value !== 'string' || value === '') throw new Error(`app config extra.${name} is missing`);
  return value;
}

/** The app's one runtime, built on first use with the keychain vault and React Native's WebSocket. */
export function getRuntime(): MobileRuntime {
  current ??= createRuntime({
    apiUrl: extra('apiUrl'),
    gatewayUrl: extra('gatewayUrl'),
    deviceName: `${BRAND.displayName} ${Platform.OS === 'ios' ? 'iOS' : 'Android'}`,
    platform: Platform.OS,
    version: Constants.expoConfig?.version ?? '0.0.0',
    vault: createSecureSessionVault(expoSecureBackend),
    refreshRequestId: uuid.v4,
    socketFactory: nativeSocketFactory,
    progressUpload: uploadWithProgress,
    cdnUrl: typeof Constants.expoConfig?.extra?.cdnUrl === 'string' ? Constants.expoConfig.extra.cdnUrl : BRAND.cdnUrl,
    ...(loadNativePush() ? { removePushToken: () => getRuntime().api.removePushToken() } : {}),
    createPrivacy: loadNativePrivacy,
    createVoice: ({ gateway, iceServers, crypto, identityKeysOf }) => {
      const native = loadNativeVoice();
      return native ? createMobileVoice({ gateway, native, socketFactory: nativeSocketFactory, iceServers, crypto, identityKeysOf }) : null;
    },
  });
  return current;
}
