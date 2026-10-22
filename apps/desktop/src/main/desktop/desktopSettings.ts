/** Device-local desktop integration settings and the rules that derive from them. Pure: no electron imports. */
import type { DesktopSettings } from '../../shared/ipc';

export type { DesktopSettings };

export const HIDDEN_FLAG = '--hidden';

export function defaultDesktopSettings(platform: NodeJS.Platform): DesktopSettings {
  return { openAtLogin: false, startMinimized: false, closeToTray: platform !== 'linux', hardwareAcceleration: true };
}

export function normalizeDesktopSettings(raw: unknown, platform: NodeJS.Platform): DesktopSettings {
  const base = defaultDesktopSettings(platform);
  const src = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const pick = (key: keyof DesktopSettings): boolean => (typeof src[key] === 'boolean' ? (src[key] as boolean) : base[key]);
  return {
    openAtLogin: pick('openAtLogin'),
    startMinimized: pick('startMinimized'),
    closeToTray: pick('closeToTray'),
    hardwareAcceleration: pick('hardwareAcceleration'),
  };
}

/** Arguments the OS passes back when it launches the app at login. */
export function loginArgs(settings: DesktopSettings): string[] {
  return settings.startMinimized ? [HIDDEN_FLAG] : [];
}

/** Whether the main window should stay hidden after launch. */
export function shouldStartHidden(settings: DesktopSettings, argv: readonly string[], wasOpenedAtLogin: boolean): boolean {
  return argv.includes(HIDDEN_FLAG) || (wasOpenedAtLogin && settings.startMinimized);
}

/** Close hides only while a tray exists to bring the window back from. */
export function shouldHideOnClose(settings: DesktopSettings, state: { quitting: boolean; hasTray: boolean; e2e: boolean }): boolean {
  return settings.closeToTray && state.hasTray && !state.quitting && !state.e2e;
}

/** Hardware acceleration is applied once at startup, so a change only takes effect after a relaunch. */
export function needsRestart(previous: DesktopSettings, next: DesktopSettings): boolean {
  return previous.hardwareAcceleration !== next.hardwareAcceleration;
}

/** XDG autostart entry used on Linux, where Electron has no login-item API. */
export function autostartDesktopEntry(name: string, exec: string, settings: DesktopSettings): string {
  const quoted = `"${exec.replace(/(["\\$`])/g, '\\$1')}"`;
  const command = settings.startMinimized ? `${quoted} ${HIDDEN_FLAG}` : quoted;
  return ['[Desktop Entry]', 'Type=Application', `Name=${name}`, `Exec=${command}`, 'X-GNOME-Autostart-enabled=true', ''].join('\n');
}

/** Port over the OS autostart registration. */
export interface LoginItemPort {
  apply(settings: DesktopSettings): void;
}
