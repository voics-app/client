import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs', async (importOriginal: () => Promise<typeof fs>) => {
  const actual = await importOriginal();
  return { ...actual, cpSync: vi.fn(actual.cpSync) };
});

import { LEGACY_USER_DATA_DIR_NAME, legacyUserDataDir, migrateLegacyUserData } from '../../../src/main/userDataMigration';

const log = { warn: vi.fn() };
const cp = vi.mocked(fs.cpSync);
const realCp = cp.getMockImplementation()!;
let root: string;
let oldDir: string;
let newDir: string;

function seedOld(): void {
  mkdirSync(join(oldDir, 'crypto'), { recursive: true });
  mkdirSync(join(oldDir, 'Local Storage', 'leveldb'), { recursive: true });
  mkdirSync(join(oldDir, 'Cache'), { recursive: true });
  mkdirSync(join(oldDir, 'GPUCache'), { recursive: true });
  writeFileSync(join(oldDir, 'crypto', 'u1.key'), 'key-bytes');
  writeFileSync(join(oldDir, 'crypto', 'u1.db'), 'db-bytes');
  writeFileSync(join(oldDir, 'main-settings.json'), '{"pushToTalkKeycode":1}');
  writeFileSync(join(oldDir, 'session.bin'), 'vault');
  writeFileSync(join(oldDir, 'Local State'), 'os-crypt');
  writeFileSync(join(oldDir, 'Local Storage', 'leveldb', '000003.log'), 'ls');
  writeFileSync(join(oldDir, 'Cache', 'junk'), 'cache');
  writeFileSync(join(oldDir, 'GPUCache', 'junk'), 'gpu');
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'voics-migrate-'));
  oldDir = join(root, LEGACY_USER_DATA_DIR_NAME);
  newDir = join(root, 'Voics');
  log.warn.mockClear();
  cp.mockImplementation(realCp);
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('migrateLegacyUserData', () => {
  it('names the old folder as a sibling of userData', () => {
    expect(basename(legacyUserDataDir(newDir))).toBe('Discordy');
    expect(legacyUserDataDir(newDir)).toBe(oldDir);
  });

  it('skips when there is no old folder', () => {
    expect(migrateLegacyUserData(oldDir, newDir, log)).toBe('skipped');
    expect(existsSync(newDir)).toBe(false);
  });

  it('copies user data and Local State, skips caches, leaves the old folder untouched', () => {
    seedOld();
    expect(migrateLegacyUserData(oldDir, newDir, log)).toBe('migrated');
    expect(readFileSync(join(newDir, 'crypto', 'u1.key'), 'utf8')).toBe('key-bytes');
    expect(readFileSync(join(newDir, 'crypto', 'u1.db'), 'utf8')).toBe('db-bytes');
    expect(readFileSync(join(newDir, 'main-settings.json'), 'utf8')).toBe('{"pushToTalkKeycode":1}');
    expect(readFileSync(join(newDir, 'session.bin'), 'utf8')).toBe('vault');
    expect(readFileSync(join(newDir, 'Local State'), 'utf8')).toBe('os-crypt');
    expect(readFileSync(join(newDir, 'Local Storage', 'leveldb', '000003.log'), 'utf8')).toBe('ls');
    expect(existsSync(join(newDir, 'Cache'))).toBe(false);
    expect(existsSync(join(newDir, 'GPUCache'))).toBe(false);
    expect(existsSync(join(newDir, '.migration-pending'))).toBe(false);
    expect(readdirSync(oldDir).sort()).toEqual(['Cache', 'GPUCache', 'Local State', 'Local Storage', 'crypto', 'main-settings.json', 'session.bin']);
    expect(readFileSync(join(oldDir, 'session.bin'), 'utf8')).toBe('vault');
  });

  it('does nothing when the new folder already has user data', () => {
    seedOld();
    mkdirSync(newDir, { recursive: true });
    writeFileSync(join(newDir, 'main-settings.json'), '{"new":true}');
    expect(migrateLegacyUserData(oldDir, newDir, log)).toBe('skipped');
    expect(readFileSync(join(newDir, 'main-settings.json'), 'utf8')).toBe('{"new":true}');
    expect(existsSync(join(newDir, 'crypto'))).toBe(false);
  });

  it('still migrates when the new folder only holds Chromium files', () => {
    seedOld();
    mkdirSync(join(newDir, 'Cache'), { recursive: true });
    writeFileSync(join(newDir, 'Local State'), 'fresh-key');
    expect(migrateLegacyUserData(oldDir, newDir, log)).toBe('migrated');
    expect(readFileSync(join(newDir, 'Local State'), 'utf8')).toBe('os-crypt');
  });

  it('retries cleanly after a failure part way and logs no contents', () => {
    seedOld();
    let calls = 0;
    cp.mockImplementation((...args: Parameters<typeof fs.cpSync>) => {
      if (++calls === 3) throw Object.assign(new Error('disk full: key-bytes'), { code: 'ENOSPC' });
      return realCp(...args);
    });
    expect(migrateLegacyUserData(oldDir, newDir, log)).toBe('failed');
    expect(log.warn).toHaveBeenCalledTimes(1);
    const message = String(log.warn.mock.calls[0]?.[0]);
    expect(message).toContain('ENOSPC');
    expect(message).not.toContain('key-bytes');
    expect(existsSync(join(newDir, '.migration-pending'))).toBe(true);
    expect(existsSync(join(newDir, 'session.bin'))).toBe(false);

    cp.mockImplementation(realCp);
    expect(migrateLegacyUserData(oldDir, newDir, log)).toBe('migrated');
    expect(readFileSync(join(newDir, 'session.bin'), 'utf8')).toBe('vault');
    expect(readFileSync(join(newDir, 'crypto', 'u1.key'), 'utf8')).toBe('key-bytes');
    expect(existsSync(join(newDir, '.migration-pending'))).toBe(false);
  });
});
