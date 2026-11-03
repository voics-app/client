/** Device-local desktop integration settings and the rules that derive from them. Pure: no electron imports. */
import { IDLE_TIMEOUT_CHOICES, type DesktopSettings } from '../../shared/ipc';

export type { DesktopSettings };

export const HIDDEN_FLAG = '--hidden';

export function defaultDesktopSettings(platform: NodeJS.Platform): DesktopSettings {
  return { openAtLogin: false, startMinimized: false, showTray: true, minimizeToTray: false, closeToTray: platform !== 'linux', hardwareAcceleration: true, idleTimeoutMinutes: 10 };
}

export function normalizeDesktopSettings(raw: unknown, platform: NodeJS.Platform): DesktopSettings {
  const base = defaultDesktopSettings(platform);
  const src = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const pick = (key: 'openAtLogin' | 'startMinimized' | 'showTray' | 'minimizeToTray' | 'closeToTray' | 'hardwareAcceleration'): boolean => (typeof src[key] === 'boolean' ? (src[key] as boolean) : base[key]);
  const idle = Number(src.idleTimeoutMinutes);
  return {
    openAtLogin: pick('openAtLogin'),
    startMinimized: pick('startMinimized'),
    showTray: pick('showTray'),
    minimizeToTray: pick('minimizeToTray'),
    closeToTray: pick('closeToTray'),
    hardwareAcceleration: pick('hardwareAcceleration'),
    idleTimeoutMinutes: IDLE_TIMEOUT_CHOICES.includes(idle) ? idle : base.idleTimeoutMinutes,
  };
}

/** Arguments the OS passes back when it launches the app at login. */
export function loginArgs(settings: DesktopSettings): string[] {
  return settings.startMinimized ? [HIDDEN_FLAG] : [];
}

/** Whether the main window should stay hidden after launch; never without a tray, which would leave no way back in. */
export function shouldStartHidden(settings: DesktopSettings, argv: readonly string[], wasOpenedAtLogin: boolean): boolean {
  return settings.showTray && (argv.includes(HIDDEN_FLAG) || (wasOpenedAtLogin && settings.startMinimized));
}

/** Whether the tray icon should exist (the end-to-end tests run without one). */
export function shouldShowTray(settings: DesktopSettings, e2e: boolean): boolean {
  return settings.showTray && !e2e;
}

/** Close hides only while a tray exists to bring the window back from. */
export function shouldHideOnClose(settings: DesktopSettings, state: { quitting: boolean; hasTray: boolean; e2e: boolean }): boolean {
  return settings.closeToTray && state.hasTray && !state.quitting && !state.e2e;
}

/** Minimizing hides to the tray only while a tray exists to bring the window back from. */
export function shouldHideOnMinimize(settings: DesktopSettings, state: { quitting: boolean; hasTray: boolean; e2e: boolean }): boolean {
  return settings.minimizeToTray && state.hasTray && !state.quitting && !state.e2e;
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
