import * as SecureStore from 'expo-secure-store';
import type { SecureBackend } from './secureSessionVault';

// Readable after the first unlock so a later background reconnect can still reach the tokens; never leaves this device.
const options: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };

export const expoSecureBackend: SecureBackend = {
  getItemAsync: (key) => SecureStore.getItemAsync(key, options),
  setItemAsync: (key, value) => SecureStore.setItemAsync(key, value, options),
  deleteItemAsync: (key) => SecureStore.deleteItemAsync(key, options),
};
