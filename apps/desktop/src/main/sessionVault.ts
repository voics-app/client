/** Auth tokens, encrypted at rest by the OS keychain via Electron safeStorage. */
import type { StoredSession } from '../shared/ipc';
import { readSecret, removeFile, userDataPath, writeSecret } from './persistence';

const FILE = () => userDataPath('session.bin');

function isStoredSession(value: unknown): value is StoredSession {
  const v = value as Partial<StoredSession> | null;
  return Boolean(v && typeof v.accessToken === 'string' && typeof v.refreshToken === 'string' && typeof v.userId === 'string');
}

export const sessionVault = {
  load(): StoredSession | null {
    const raw = readSecret(FILE());
    if (!raw) return null;
    try {
      const parsed: unknown = JSON.parse(raw.toString('utf8'));
      return isStoredSession(parsed) ? parsed : null;
    } catch {
      return null;
    }
  },
  save(session: StoredSession): void {
    if (!isStoredSession(session)) throw new Error('invalid session payload');
    writeSecret(FILE(), Buffer.from(JSON.stringify(session), 'utf8'));
  },
  clear(): void {
    removeFile(FILE());
  },
};
