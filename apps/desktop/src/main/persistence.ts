/** Small JSON + safeStorage persistence under the userData directory. */
import { app, safeStorage } from 'electron';
import { mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
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

/** Writes bytes encrypted by the OS keychain (DPAPI / Keychain / libsecret). */
export function writeSecret(file: string, plaintext: Buffer): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('OS secure storage is unavailable; refusing to store secrets in plaintext');
  }
  ensureDir(file);
  writeFileSync(file, safeStorage.encryptString(plaintext.toString('base64')));
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
