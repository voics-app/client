/** One-time carry-over of local data from the old "Discordy" userData folder into the current one. */
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** Folder name of the pre-rename install; a sibling of the current userData folder on every platform. */
export const LEGACY_USER_DATA_DIR_NAME = 'Discordy';

/** Present while a copy runs; a leftover marker means the last attempt did not finish and is retried. */
const PENDING_MARKER = '.migration-pending';

/**
 * Exactly what the app persists, nothing else (no Chromium caches):
 * - crypto/, main-settings.json, session.bin: E2EE keys and databases, local settings, the session vault.
 * - Local Storage, IndexedDB: the renderer's persisted stores (localStorage in the default session).
 * - Local State: holds the DPAPI-wrapped key behind safeStorage on Windows, so session.bin and crypto/*.key stay
 *   decryptable. On macOS the key lives in the Keychain under the app name and on Linux in the secret service,
 *   so copying files cannot carry it.
 */
export const MIGRATED_ENTRIES = ['Local State', 'crypto', 'main-settings.json', 'session.bin', 'Local Storage', 'IndexedDB'] as const;

/** Entries whose presence means the new install already holds its own data. */
const USER_DATA_ENTRIES = MIGRATED_ENTRIES.filter((e) => e !== 'Local State');

export type MigrationResult = 'migrated' | 'skipped' | 'failed';

export interface MigrationLog {
  warn(message: string): void;
}

export function legacyUserDataDir(userDataDir: string): string {
  return join(dirname(userDataDir), LEGACY_USER_DATA_DIR_NAME);
}

function hasUserData(dir: string): boolean {
  return USER_DATA_ENTRIES.some((entry) => existsSync(join(dir, entry)));
}

/** Never mutates `oldDir`. Failures are logged by error code only (no tokens or keys) and never thrown. */
export function migrateLegacyUserData(oldDir: string, newDir: string, log: MigrationLog = console): MigrationResult {
  const marker = join(newDir, PENDING_MARKER);
  try {
    if (!existsSync(oldDir)) return 'skipped';
    if (!existsSync(marker) && hasUserData(newDir)) return 'skipped';
    const present = MIGRATED_ENTRIES.filter((entry) => existsSync(join(oldDir, entry)));
    if (present.length === 0) return 'skipped';

    mkdirSync(newDir, { recursive: true });
    writeFileSync(marker, '');
    for (const entry of present) {
      cpSync(join(oldDir, entry), join(newDir, entry), { recursive: true, force: true });
    }
    rmSync(marker, { force: true });
    return 'migrated';
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code ?? 'unknown';
    log.warn(`Could not carry over data from the old install (${code}); it will be retried on the next start.`);
    return 'failed';
  }
}
