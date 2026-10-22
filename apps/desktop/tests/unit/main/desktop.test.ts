import { afterEach, describe, expect, it, vi } from 'vitest';
import { DesktopService } from '../../../src/main/desktop/desktopService';
import {
  autostartDesktopEntry,
  defaultDesktopSettings,
  loginArgs,
  needsRestart,
  normalizeDesktopSettings,
  shouldHideOnClose,
  shouldStartHidden,
} from '../../../src/main/desktop/desktopSettings';
import { buildTrayMenu, type TrayMenuItem } from '../../../src/main/desktop/trayModel';

vi.mock('electron', () => ({ app: { isPackaged: false } }));
vi.mock('electron-updater', () => ({ autoUpdater: {} }));

describe('desktop settings', () => {
  it('defaults close-to-tray on win/mac and off on linux', () => {
    expect(defaultDesktopSettings('win32').closeToTray).toBe(true);
    expect(defaultDesktopSettings('linux').closeToTray).toBe(false);
    expect(defaultDesktopSettings('win32')).toMatchObject({ openAtLogin: false, startMinimized: false, hardwareAcceleration: true });
  });
  it('drops junk and keeps valid booleans', () => {
    expect(normalizeDesktopSettings({ openAtLogin: 'yes', startMinimized: true, hardwareAcceleration: false }, 'win32')).toEqual({
      openAtLogin: false,
      startMinimized: true,
      closeToTray: true,
      hardwareAcceleration: false,
    });
    expect(normalizeDesktopSettings(null, 'win32')).toEqual(defaultDesktopSettings('win32'));
  });
  it('passes --hidden at login only when start minimized', () => {
    const s = defaultDesktopSettings('win32');
    expect(loginArgs(s)).toEqual([]);
    expect(loginArgs({ ...s, startMinimized: true })).toEqual(['--hidden']);
  });
  it('starts hidden from the flag or from a login launch with the option on', () => {
    const s = { ...defaultDesktopSettings('win32'), startMinimized: true };
    expect(shouldStartHidden(s, ['app.exe', '--hidden'], false)).toBe(true);
    expect(shouldStartHidden(s, ['app.exe'], true)).toBe(true);
    expect(shouldStartHidden(s, ['app.exe'], false)).toBe(false);
    expect(shouldStartHidden({ ...s, startMinimized: false }, ['app.exe'], true)).toBe(false);
  });
  it('hides on close only with the option, a tray, and not while quitting', () => {
    const s = defaultDesktopSettings('win32');
    const ok = { quitting: false, hasTray: true, e2e: false };
    expect(shouldHideOnClose(s, ok)).toBe(true);
    expect(shouldHideOnClose({ ...s, closeToTray: false }, ok)).toBe(false);
    expect(shouldHideOnClose(s, { ...ok, hasTray: false })).toBe(false);
    expect(shouldHideOnClose(s, { ...ok, quitting: true })).toBe(false);
    expect(shouldHideOnClose(s, { ...ok, e2e: true })).toBe(false);
  });
  it('requires a restart only for hardware acceleration', () => {
    const s = defaultDesktopSettings('win32');
    expect(needsRestart(s, { ...s, hardwareAcceleration: false })).toBe(true);
    expect(needsRestart(s, { ...s, openAtLogin: true })).toBe(false);
  });
  it('writes a quoted XDG autostart entry', () => {
    const entry = autostartDesktopEntry('Brand', '/opt/My App/app', { ...defaultDesktopSettings('linux'), startMinimized: true });
    expect(entry).toContain('Exec="/opt/My App/app" --hidden');
    expect(entry).toContain('Name=Brand');
  });
});

describe('DesktopService', () => {
  const make = (stored: unknown = null) => {
    const apply = vi.fn();
    const saved: unknown[] = [];
    const service = new DesktopService({ load: () => stored, save: () => undefined }, { apply }, 'win32', (s) => saved.push(s));
    return { service, apply, saved };
  };
  it('loads normalized settings', () => expect(make({ closeToTray: false }).service.get().closeToTray).toBe(false));
  it('persists, applies the login item and flags restart', () => {
    const { service, apply, saved } = make();
    const r = service.update({ openAtLogin: true, hardwareAcceleration: false, bogus: 1 });
    expect(r.restartRequired).toBe(true);
    expect(r.settings.openAtLogin).toBe(true);
    expect(apply).toHaveBeenCalledWith(r.settings);
    expect(saved).toEqual([r.settings]);
    expect(service.update({ startMinimized: true }).restartRequired).toBe(false);
  });
  it('ignores a non-object patch', () => expect(make().service.update('x').settings).toEqual(defaultDesktopSettings('win32')));
});

describe('tray menu', () => {
  const base = { brand: 'Brand', version: '1.2.3', activity: { mentions: 0, unread: 0 }, voice: { muted: false, deafened: false } };
  const find = (items: TrayMenuItem[], id: string) => items.find((i) => i.kind === 'item' && i.id === id) as Extract<TrayMenuItem, { kind: 'item' }>;
  it('lists open, mute, deafen, quit with actions', () => {
    const m = buildTrayMenu(base);
    expect(find(m, 'open').action).toBe('open');
    expect(find(m, 'mute').action).toBe('toggleMute');
    expect(find(m, 'deafen').action).toBe('toggleDeafen');
    expect(find(m, 'quit').label).toBe('Quit Brand');
    expect(find(m, 'unread').label).toBe('No unread messages');
  });
  it('shows unread counts', () => expect(find(buildTrayMenu({ ...base, activity: { mentions: 1, unread: 4 } }), 'unread').label).toBe('1 mention, 4 unread'));
  it('deafen implies muted and locks the mute item', () => {
    const m = buildTrayMenu({ ...base, voice: { muted: false, deafened: true } });
    expect(find(m, 'mute')).toMatchObject({ checked: true, enabled: false });
    expect(find(m, 'deafen').checked).toBe(true);
  });
});

describe('updater', () => {
  afterEach(() => vi.useRealTimers());
  async function build(enabled = true) {
    const { Updater } = await import('../../../src/main/updater');
    const handlers: Record<string, (...a: never[]) => void> = {};
    const port = {
      isEnabled: () => enabled,
      check: vi.fn().mockResolvedValue(undefined),
      quitAndInstall: vi.fn(),
      on: (e: string, l: (...a: never[]) => void) => {
        handlers[e] = l;
      },
    };
    const published: unknown[] = [];
    const updater = new Updater(port as never, (s) => published.push(s));
    return { updater, port, handlers, published };
  }
  it('maps port events to status with release notes', async () => {
    const { handlers, published } = await build();
    (handlers.downloaded as unknown as (i: unknown) => void)({ version: '2.0.0', releaseNotes: '<p>Fixes &amp; things</p><ul><li>One</li></ul>' });
    expect(published.at(-1)).toEqual({ state: 'downloaded', version: '2.0.0', notes: 'Fixes & things\nOne' });
    (handlers.progress as unknown as (p: number) => void)(41.6);
    expect(published.at(-1)).toEqual({ state: 'downloading', percent: 42 });
  });
  it('reports up to date without calling the feed when not packaged', async () => {
    const { updater, port, published } = await build(false);
    await updater.check();
    expect(port.check).not.toHaveBeenCalled();
    expect(published.at(-1)).toEqual({ state: 'not-available' });
  });
  it('does not re-check once an update is downloaded', async () => {
    const { updater, port, handlers } = await build();
    (handlers.downloaded as unknown as (i: unknown) => void)({ version: '2.0.0' });
    await updater.check();
    expect(port.check).not.toHaveBeenCalled();
  });
  it('checks on launch and then periodically, and installs on request', async () => {
    vi.useFakeTimers();
    const { updater, port } = await build();
    updater.start({ delayMs: 1000, intervalMs: 5000 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(port.check).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(port.check).toHaveBeenCalledTimes(2);
    updater.stop();
    await vi.advanceTimersByTimeAsync(20000);
    expect(port.check).toHaveBeenCalledTimes(2);
    updater.install();
    expect(port.quitAndInstall).toHaveBeenCalled();
  });
});
