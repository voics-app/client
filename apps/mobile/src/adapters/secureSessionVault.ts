import type { SessionVault } from '@discordy/core/application/sessionManager';
import type { StoredSession } from '@discordy/core/application/ports/sessionVault';

/** The slice of expo-secure-store the vault needs; tests supply a fake. */
export interface SecureBackend {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

export const SESSION_KEY = 'discordy.session';

function isStoredSession(value: unknown): value is StoredSession {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.accessToken === 'string' &&
    typeof v.refreshToken === 'string' &&
    typeof v.userId === 'string' &&
    (v.deviceId === null || typeof v.deviceId === 'string')
  );
}

/** Keeps the session tokens in the OS keychain. A damaged entry is dropped and reads as signed out. */
export function createSecureSessionVault(backend: SecureBackend): SessionVault {
  return {
    async load() {
      const raw = await backend.getItemAsync(SESSION_KEY);
      if (raw === null) return null;
      try {
        const parsed: unknown = JSON.parse(raw);
        if (isStoredSession(parsed)) return parsed;
      } catch {
        // fall through: unreadable entry
      }
      await backend.deleteItemAsync(SESSION_KEY);
      return null;
    },
    save: (session) => backend.setItemAsync(SESSION_KEY, JSON.stringify(session)),
    clear: () => backend.deleteItemAsync(SESSION_KEY),
  };
}
