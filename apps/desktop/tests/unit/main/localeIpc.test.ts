import { beforeEach, expect, it, vi } from 'vitest';
import { IpcChannel } from '../../../src/shared/ipc';
const listeners = vi.hoisted(() => new Map<string, (event: unknown, value: unknown) => void>());
vi.mock('electron', () => ({ Notification: {}, powerMonitor: {}, shell: {}, ipcMain: { handle: vi.fn(), on: (name: string, fn: (event: unknown, value: unknown) => void) => listeners.set(name, fn) } }));
vi.mock('../../../src/main/config', () => ({ validateProfile: vi.fn() }));
vi.mock('../../../src/main/capture', () => ({ listCaptureSources: vi.fn(), selectCaptureSource: vi.fn() }));
vi.mock('../../../src/main/hotkeys', () => ({ sanitizeSpecs: vi.fn() }));
vi.mock('../../../src/main/sessionVault', () => ({ sessionVault: {} }));
vi.mock('../../../src/main/settings', () => ({ saveMainSettings: vi.fn() }));
import { registerIpc, type IpcDeps } from '../../../src/main/ipc';

beforeEach(() => listeners.clear());

it('accepts language only from the main renderer, normalizes supported regions and ignores malformed payloads', () => {
  const sender = {};
  const setLocale = vi.fn();
  registerIpc({ window: () => ({ webContents: sender }), setLocale } as unknown as IpcDeps);
  const handle = listeners.get(IpcChannel.appLocale)!;
  handle({ sender }, 'nl-nl');
  expect(setLocale).toHaveBeenLastCalledWith('nl-NL');
  handle({ sender }, 'unsupported');
  expect(setLocale).toHaveBeenLastCalledWith('en-US');
  handle({ sender }, { locale: 'nl' });
  handle({ sender }, 'n'.repeat(65));
  expect(setLocale).toHaveBeenCalledTimes(2);
  expect(() => handle({ sender: {} }, 'nl')).toThrow('IPC from untrusted sender');
  expect(setLocale).toHaveBeenCalledTimes(2);
});
