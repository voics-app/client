import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import type * as Fs from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { readSecret, writeSecret } from '../../../src/main/persistence';

const fault = vi.hoisted(() => ({ interruptWrite: false, profile: '' }));
vi.mock('electron', () => ({
  app: { getPath: () => fault.profile },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from(`sealed:${value}`),
    decryptString: (bytes: Buffer) => {
      if (!bytes.toString().startsWith('sealed:')) throw new Error('damaged ciphertext');
      return bytes.toString().slice(7);
    },
  },
}));
vi.mock('node:fs', async (importOriginal) => {
  const fs = await importOriginal<typeof Fs>();
  return {
    ...fs,
    writeFileSync: vi.fn<typeof fs.writeFileSync>((file, data, options) => {
      if (fault.interruptWrite) {
        fs.writeFileSync(file, Buffer.from('partial ciphertext'), options);
        throw new Error('write interrupted');
      }
      return fs.writeFileSync(file, data, options);
    }),
  };
});

const directories: string[] = [];
afterEach(() => {
  fault.interruptWrite = false;
  vi.useRealTimers();
  for (const directory of directories.splice(0)) {
    if (!resolve(directory).startsWith(resolve(tmpdir()) + sep)) throw new Error('unexpected test directory');
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('encrypted credential persistence', () => {
  it('keeps the previous complete credentials when a replacement write is interrupted', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'voics-persistence-'));
    directories.push(directory);
    fault.profile = directory;
    writeFileSync(join(directory, 'Local State'), JSON.stringify({ os_crypt: { encrypted_key: 'persisted-fixture' } }));
    const file = join(directory, 'session.bin');
    await writeSecret(file, Buffer.from('previous complete session'));
    fault.interruptWrite = true;
    await expect(Promise.resolve().then(() => writeSecret(file, Buffer.from('successor session')))).rejects.toThrow('write interrupted');
    expect(readSecret(file)?.toString()).toBe('previous complete session');
    expect(readdirSync(directory).sort()).toEqual(['Local State', 'session.bin']);
    fault.interruptWrite = false;
    await writeSecret(file, Buffer.from('successor session'));
    expect(readSecret(file)?.toString()).toBe('successor session');
  });

  it.runIf(process.platform === 'win32')('waits for the Windows profile encryption key before storing a recoverable secret', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'voics-persistence-'));
    directories.push(directory);
    fault.profile = directory;
    const file = join(directory, 'session.bin');
    let completed = false;
    const pending = Promise.resolve().then(() => writeSecret(file, Buffer.from('session'))).then(() => { completed = true; });
    await new Promise((done) => setTimeout(done, 10));
    expect(completed).toBe(false);
    expect(existsSync(file)).toBe(false);
    writeFileSync(join(directory, 'Local State'), JSON.stringify({ os_crypt: { encrypted_key: 'persisted-fixture' } }));
    await pending;
    expect(readSecret(file)?.toString()).toBe('session');
  });

  it.runIf(process.platform === 'win32')('fails without replacing credentials when the profile key cannot be persisted, then permits a retry', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'voics-persistence-'));
    directories.push(directory);
    fault.profile = directory;
    const file = join(directory, 'session.bin');
    vi.useFakeTimers();
    const failed = expect(writeSecret(file, Buffer.from('session'))).rejects.toThrow('Secure storage is not ready');
    await vi.advanceTimersByTimeAsync(15_000);
    await failed;
    expect(existsSync(file)).toBe(false);
    writeFileSync(join(directory, 'Local State'), JSON.stringify({ os_crypt: { encrypted_key: 'persisted-fixture' } }));
    await writeSecret(file, Buffer.from('session'));
    expect(readSecret(file)?.toString()).toBe('session');
  });
});
