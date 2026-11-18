/** Small JSON + safeStorage persistence under the userData directory. */
import { app, safeStorage } from 'electron';
import { mkdirSync, readFileSync, writeFileSync, renameSync, rmSync, existsSync, openSync, fsyncSync, closeSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';

export function userDataPath(...segments: string[]): string {
  return join(app.getPath('userData'), ...segments);
}

function ensureDir(file: string): void {
  mkdirSync(dirname(file), { recursive: true });
}

export function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

export function writeJson(file: string, value: unknown): void {
  ensureDir(file);
  writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

const keyPersistence = new Map<string, Promise<void>>();

/**
 * Electron 38's Windows encryption key lives in Chromium's Local State. Its
 * first write is delayed: encryptString can succeed before that key exists on
 * disk. Never acknowledge a durable secret until the wrapped key is flushed.
 * Session/cookie flush APIs do not flush this browser-level preference file.
 */
async function waitForEncryptionKey(): Promise<void> {
  if (process.platform !== 'win32') return;
  const file = userDataPath('Local State');
  let pending = keyPersistence.get(file);
  if (!pending) {
    pending = (async () => {
      const deadline = Date.now() + 15_000;
      while (true) {
        if (flushEncryptionKey(file)) return;
        if (Date.now() >= deadline) throw new Error('Secure storage is not ready; try signing in again');
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    })();
    keyPersistence.set(file, pending);
    void pending.catch(() => keyPersistence.delete(file));
  }
  await pending;
}

function flushEncryptionKey(file: string): boolean {
  try {
    const fd = openSync(file, 'r+');
    try {
      const state = JSON.parse(readFileSync(fd, 'utf8')) as { os_crypt?: { encrypted_key?: unknown } };
      if (typeof state.os_crypt?.encrypted_key !== 'string' || !state.os_crypt.encrypted_key) return false;
      fsyncSync(fd);
      return true;
    } finally {
      closeSync(fd);
    }
  } catch {
    return false;
  }
}

/** Writes bytes encrypted by the OS keychain (DPAPI / Keychain / libsecret). */
export async function writeSecret(file: string, plaintext: Buffer): Promise<void> {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('OS secure storage is unavailable; refusing to store secrets in plaintext');
  }
  ensureDir(file);
  const encrypted = safeStorage.encryptString(plaintext.toString('base64'));
  await waitForEncryptionKey();
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    // Keep the previous complete secret until the replacement is flushed. A
    // crash during the write must not truncate the only recoverable session.
    writeFileSync(temporary, encrypted, { flag: 'wx', mode: 0o600, flush: true });
    renameSync(temporary, file);
  } finally {
    rmSync(temporary, { force: true });
  }
}

export function readSecret(file: string): Buffer | null {
  if (!existsSync(file) || !safeStorage.isEncryptionAvailable()) return null;
  try {
    return Buffer.from(safeStorage.decryptString(readFileSync(file)), 'base64');
  } catch {
    return null;
  }
}

export function removeFile(file: string): void {
  rmSync(file, { force: true });
}
