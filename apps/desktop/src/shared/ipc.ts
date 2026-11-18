/**
 * Typed IPC contract shared by main, preload and renderer. The renderer is
 * sandboxed; everything privileged goes through `window.discordy`.
 */

import type { AppInfo, ConnectionProfile, ConnectionProfileId } from '@discordy/core/domain/appInfo';
import type { StoredSession } from '@discordy/core/application/ports/sessionVault';
import type { UpdateStatus } from '@discordy/core/domain/updateStatus';
import type { CryptoBridge, CryptoStatus, IncomingMlsResult, LocalMessageRecord } from '@discordy/core/application/ports/crypto';
import type { PasskeyRequest, PasskeyResult, PasskeySite } from './passkeys';

export type { AppInfo, ConnectionProfile, ConnectionProfileId, UpdateStatus };

export type { StoredSession };

export interface CaptureSource {
  id: string;
  name: string;
  kind: 'screen' | 'window';
  thumbnailDataUrl: string;
  appIconDataUrl: string | null;
}

export interface CaptureSelection {
  sourceId: string;
  /** Capture system/app audio via Windows loopback where supported. */
  audio: boolean;
}

/** Device-local desktop integration settings (never synced to the account). */
export interface DesktopSettings {
  openAtLogin: boolean;
  startMinimized: boolean;
  /** Show the system tray icon at all; with it off, closing the window quits. */
  showTray: boolean;
  /** The minimize button hides the window to the tray. */
  minimizeToTray: boolean;
  /** The close button hides the window to the tray instead of quitting. */
  closeToTray: boolean;
  hardwareAcceleration: boolean;
  /** Minutes without keyboard or mouse input before the status turns Idle; 0 turns automatic idle off. */
  idleTimeoutMinutes: number;
}

/** Allowed automatic idle timeouts in minutes; 0 is off. */
export const IDLE_TIMEOUT_CHOICES: readonly number[] = [0, 1, 5, 10, 15, 30, 60];

export type TrayCommand = 'toggleMute' | 'toggleDeafen';

/** Self mute/deafen the renderer reports so the tray menu can show and toggle them. */
export interface VoiceState {
  muted: boolean;
  deafened: boolean;
}

/** Unread/mention totals the renderer pushes to main so it can drive the taskbar, tray and window title. */
export interface ActivityCounts {
  /** Total unread mentions. */
  mentions: number;
  /** Unmuted channels with unread messages. */
  unread: number;
}

export interface NotificationRequest {
  title: string;
  body: string;
  route?: string;
  silent?: boolean;
}

export type { CryptoBridge, CryptoStatus, IncomingMlsResult, LocalMessageRecord };

export interface DiscordyBridge {
  passkeys: {
    site(): Promise<PasskeySite | null>;
    perform(request: PasskeyRequest): Promise<PasskeyResult>;
    cancel(id: string): Promise<void>;
  };
  app: {
    info(): Promise<AppInfo>;
    setConnection(profile: ConnectionProfile): Promise<AppInfo>;
    openExternal(url: string): Promise<void>;
    setActivity(counts: ActivityCounts): void;
    /** Current account UI locale, also used by native menus and accessibility descriptions. */
    setLocale(locale: string): void;
    notify(request: NotificationRequest): void;
    onNavigate(listener: (route: string) => void): () => void;
    /** Route of the deep link that launched the app, if it has not been delivered yet. */
    takePendingRoute(): Promise<string | null>;
    flashFrame(): void;
    /** Sets the UI zoom factor of this window (Ctrl +, Ctrl -, Ctrl 0 and the Appearance page). */
    setZoom(factor: number): void;
    /** Reports self mute/deafen for the tray menu. */
    setVoiceState(state: VoiceState): void;
    onTrayCommand(listener: (command: TrayCommand) => void): () => void;
  };
  desktop: {
    get(): Promise<DesktopSettings>;
    set(patch: Partial<DesktopSettings>): Promise<{ settings: DesktopSettings; restartRequired: boolean }>;
    relaunch(): void;
  };
  idle: {
    /** Seconds since the last keyboard or mouse input anywhere on the OS. */
    seconds(): Promise<number>;
    /** Fires with true when the screen locks or the machine suspends, false when it comes back. */
    onLock(listener: (locked: boolean) => void): () => void;
  };
  session: {
    load(): Promise<StoredSession | null>;
    save(session: StoredSession): Promise<void>;
    clear(): Promise<void>;
  };
  capture: {
    listSources(): Promise<CaptureSource[]>;
    select(selection: CaptureSelection): Promise<void>;
  };
  hotkeys: {
    setPushToTalk(keycode: number | null): Promise<boolean>;
    onPushToTalk(listener: (pressed: boolean) => void): () => void;
    /** Registers the system-wide key combinations; false when the native key hook is unavailable. */
    setGlobalKeybinds(specs: GlobalKeybindSpec[]): Promise<boolean>;
    onGlobalKeybind(listener: (event: { id: string; pressed: boolean }) => void): () => void;
  };
  updates: {
    check(): Promise<void>;
    install(): void;
    onStatus(listener: (status: UpdateStatus) => void): () => void;
  };
  crypto: CryptoBridge;
}

/** One system-wide key combination: modifiers plus a uiohook keycode; `hold` actions also report the release. */
export interface GlobalKeybindSpec {
  id: string;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  keycode: number;
  hold: boolean;
}

export const IpcChannel = {
  passkeySite: 'passkeys:site',
  passkeyPerform: 'passkeys:perform',
  passkeyCancel: 'passkeys:cancel',
  appInfo: 'app:info',
  appSetConnection: 'app:set-connection',
  appOpenExternal: 'app:open-external',
  appActivity: 'app:activity',
  appLocale: 'app:locale',
  appNotify: 'app:notify',
  appNavigate: 'app:navigate',
  appTakePendingRoute: 'app:take-pending-route',
  appFlash: 'app:flash',
  appVoiceState: 'app:voice-state',
  appTrayCommand: 'app:tray-command',
  desktopGet: 'desktop:get',
  desktopSet: 'desktop:set',
  desktopRelaunch: 'desktop:relaunch',
  idleSeconds: 'idle:seconds',
  idleLock: 'idle:lock',
  sessionLoad: 'session:load',
  sessionSave: 'session:save',
  sessionClear: 'session:clear',
  captureList: 'capture:list',
  captureSelect: 'capture:select',
  hotkeyPtt: 'hotkey:ptt',
  hotkeyPttEvent: 'hotkey:ptt-event',
  hotkeyGlobal: 'hotkey:global',
  hotkeyGlobalEvent: 'hotkey:global-event',
  updatesCheck: 'updates:check',
  updatesInstall: 'updates:install',
  updatesStatus: 'updates:status',
  crypto: 'crypto:call',
} as const;

export type CryptoMethod = keyof CryptoBridge;
