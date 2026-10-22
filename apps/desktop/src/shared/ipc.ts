/**
 * Typed IPC contract shared by main, preload and renderer. The renderer is
 * sandboxed; everything privileged goes through `window.discordy`.
 */

export type ConnectionProfileId = 'production' | 'local' | 'custom';

export interface ConnectionProfile {
  id: ConnectionProfileId;
  apiUrl: string;
  gatewayUrl: string;
  cdnUrl: string;
}

export interface AppInfo {
  version: string;
  platform: string;
  updateFeedUrl: string;
  connection: ConnectionProfile;
  e2eTest: boolean;
}

export interface StoredSession {
  accessToken: string;
  refreshToken: string;
  userId: string;
  deviceId: string | null;
}

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
  closeToTray: boolean;
  hardwareAcceleration: boolean;
}

export type TrayCommand = 'toggleMute' | 'toggleDeafen';

/** Self mute/deafen the renderer reports so the tray menu can show and toggle them. */
export interface VoiceState {
  muted: boolean;
  deafened: boolean;
}

export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available'; version: string; notes?: string }
  | { state: 'not-available' }
  | { state: 'downloading'; percent: number }
  | { state: 'downloaded'; version: string; notes?: string }
  | { state: 'error'; message: string };

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

export interface CryptoStatus {
  available: boolean;
  reason?: string;
}

export interface IncomingMlsResult {
  kind: 'application' | 'commit' | 'proposal' | 'ignored';
  plaintextB64?: string;
  senderIdentity?: string;
  epoch?: number;
}

export interface LocalMessageRecord {
  channelId: string;
  messageId: string;
  sortKey: number;
  json: string;
}

export interface CryptoBridge {
  status(): Promise<CryptoStatus>;
  /** Opens the per-user encrypted store and returns the device identity public key (base64). */
  initialise(userId: string, deviceLabel: string): Promise<string>;
  sign(dataB64: string): Promise<string>;
  verify(publicKeyB64: string, dataB64: string, signatureB64: string): Promise<boolean>;
  generateKeyPackages(count: number): Promise<string[]>;
  hasGroup(groupId: string): Promise<boolean>;
  /** Forgets a local MLS group; resolves false when there was none. */
  deleteGroup(groupId: string): Promise<boolean>;
  createGroup(groupId: string): Promise<number>;
  addMembers(groupId: string, keyPackagesB64: string[]): Promise<{ commitB64: string; welcomeB64: string; epoch: number }>;
  /** Identity public keys (base64) of every device currently in the MLS group, this device included. */
  memberKeys(groupId: string): Promise<string[]>;
  /** Commits the removal of the devices owning these identity keys; resolves null when none of them is a member. */
  removeMembers(groupId: string, identityKeysB64: string[]): Promise<{ commitB64: string; epoch: number } | null>;
  joinFromWelcome(welcomeB64: string): Promise<{ groupId: string; epoch: number }>;
  encrypt(groupId: string, plaintextB64: string): Promise<{ ciphertextB64: string; epoch: number }>;
  processIncoming(groupId: string, messageB64: string): Promise<IncomingMlsResult>;
  exportSecret(groupId: string, label: string, length: number): Promise<string>;
  putMessage(record: LocalMessageRecord): Promise<void>;
  listMessages(channelId: string, beforeSortKey: number | null, limit: number): Promise<LocalMessageRecord[]>;
  deleteMessage(channelId: string, messageId: string): Promise<void>;
}

export interface DiscordyBridge {
  app: {
    info(): Promise<AppInfo>;
    setConnection(profile: ConnectionProfile): Promise<AppInfo>;
    openExternal(url: string): Promise<void>;
    setActivity(counts: ActivityCounts): void;
    notify(request: NotificationRequest): void;
    onNavigate(listener: (route: string) => void): () => void;
    /** Route of the deep link that launched the app, if it has not been delivered yet. */
    takePendingRoute(): Promise<string | null>;
    flashFrame(): void;
    /** Reports self mute/deafen for the tray menu. */
    setVoiceState(state: VoiceState): void;
    onTrayCommand(listener: (command: TrayCommand) => void): () => void;
  };
  desktop: {
    get(): Promise<DesktopSettings>;
    set(patch: Partial<DesktopSettings>): Promise<{ settings: DesktopSettings; restartRequired: boolean }>;
    relaunch(): void;
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
  };
  updates: {
    check(): Promise<void>;
    install(): void;
    onStatus(listener: (status: UpdateStatus) => void): () => void;
  };
  crypto: CryptoBridge;
}

export const IpcChannel = {
  appInfo: 'app:info',
  appSetConnection: 'app:set-connection',
  appOpenExternal: 'app:open-external',
  appActivity: 'app:activity',
  appNotify: 'app:notify',
  appNavigate: 'app:navigate',
  appTakePendingRoute: 'app:take-pending-route',
  appFlash: 'app:flash',
  appVoiceState: 'app:voice-state',
  appTrayCommand: 'app:tray-command',
  desktopGet: 'desktop:get',
  desktopSet: 'desktop:set',
  desktopRelaunch: 'desktop:relaunch',
  sessionLoad: 'session:load',
  sessionSave: 'session:save',
  sessionClear: 'session:clear',
  captureList: 'capture:list',
  captureSelect: 'capture:select',
  hotkeyPtt: 'hotkey:ptt',
  hotkeyPttEvent: 'hotkey:ptt-event',
  updatesCheck: 'updates:check',
  updatesInstall: 'updates:install',
  updatesStatus: 'updates:status',
  crypto: 'crypto:call',
} as const;

export type CryptoMethod = keyof CryptoBridge;
