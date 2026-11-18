/** IPC handlers: the only path from the sandboxed renderer to privileged APIs. */
import type { BrowserWindow} from 'electron';
import { Notification, ipcMain, powerMonitor, shell } from 'electron';
import { IpcChannel, type AppInfo, type ConnectionProfile, type ActivityCounts, type NotificationRequest, type StoredSession, type CaptureSelection, type VoiceState } from '../shared/ipc';
import { validateProfile } from './config';
import { listCaptureSources, selectCaptureSource } from './capture';
import type { CryptoHost } from './cryptoHost';
import { sanitizeSpecs, type GlobalKeybinds, type PushToTalk } from './hotkeys';
import { sessionVault } from './sessionVault';
import { saveMainSettings } from './settings';
import type { Updater } from './updater';
import type { DesktopService } from './desktop/desktopService';
import type { PasskeyBroker } from './passkeys/passkeyBroker';
import type { PasskeySite } from '../shared/passkeys';
import { resolveLocale } from '@discordy/core/domain/i18n';

/** OS input idle time; the e2e harness can pin it with `globalThis.__e2eIdleSeconds` since a test cannot stop real input. */
export function systemIdleSeconds(e2e: boolean, read: () => number): number {
  const override = (globalThis as { __e2eIdleSeconds?: unknown }).__e2eIdleSeconds;
  if (e2e && typeof override === 'number') return override;
  return read();
}

export interface IpcDeps {
  passkeys: PasskeyBroker;
  passkeySite: () => PasskeySite | null;
  window: () => BrowserWindow | null;
  info: () => AppInfo;
  setConnection: (profile: ConnectionProfile) => void;
  crypto: CryptoHost;
  pushToTalk: PushToTalk;
  globalKeybinds: GlobalKeybinds;
  updater: Updater;
  takePendingRoute: () => string | null;
  setActivity: (counts: ActivityCounts) => void;
  setLocale: (locale: string) => void;
  setVoiceState: (state: VoiceState) => void;
  desktop: DesktopService;
  relaunch: () => void;
}

function assertTrustedSender(event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent, deps: IpcDeps): void {
  if (event.sender !== deps.window()?.webContents) throw new Error('IPC from untrusted sender');
}

export function registerIpc(deps: IpcDeps): void {
  const passkeyHandle = (channel: string, run: (value: unknown) => unknown) => ipcMain.handle(channel, (event, value: unknown) => {
    assertTrustedSender(event, deps);
    if (event.senderFrame !== event.sender.mainFrame) throw new Error('Passkey IPC requires the main frame');
    return run(value);
  });
  passkeyHandle(IpcChannel.passkeySite, () => deps.passkeySite());
  passkeyHandle(IpcChannel.passkeyPerform, value => deps.passkeys.perform(value));
  passkeyHandle(IpcChannel.passkeyCancel, id => {
    if (typeof id === 'string') deps.passkeys.cancel(id);
  });
  const handle = <A extends unknown[], R>(channel: string, fn: (...args: A) => R | Promise<R>) =>
    ipcMain.handle(channel, (event, ...args) => {
      assertTrustedSender(event, deps);
      return fn(...(args as A));
    });
  const on = <A extends unknown[]>(channel: string, fn: (...args: A) => void) =>
    ipcMain.on(channel, (event, ...args) => {
      assertTrustedSender(event, deps);
      fn(...(args as A));
    });

  handle(IpcChannel.appInfo, () => deps.info());
  handle(IpcChannel.appTakePendingRoute, () => deps.takePendingRoute());
  handle(IpcChannel.appSetConnection, (profile: ConnectionProfile) => {
    const valid = validateProfile(profile);
    saveMainSettings({ connection: valid });
    deps.setConnection(valid);
    return deps.info();
  });
  handle(IpcChannel.appOpenExternal, async (url: string) => {
    if (typeof url === 'string' && /^https:\/\//.test(url)) await shell.openExternal(url);
  });
  on(IpcChannel.appActivity, (counts: ActivityCounts) => {
    deps.setActivity({ mentions: Number(counts?.mentions), unread: Number(counts?.unread) });
  });
  on(IpcChannel.appLocale, (locale: unknown) => {
    if (typeof locale === 'string' && locale.length <= 64) deps.setLocale(resolveLocale(locale));
  });
  on(IpcChannel.appVoiceState, (state: VoiceState) => {
    deps.setVoiceState({ muted: Boolean(state?.muted), deafened: Boolean(state?.deafened) });
  });
  handle(IpcChannel.idleSeconds, () => systemIdleSeconds(process.env.DISCORDY_E2E === '1', () => powerMonitor.getSystemIdleTime()));
  handle(IpcChannel.desktopGet, () => deps.desktop.get());
  handle(IpcChannel.desktopSet, (patch: unknown) => deps.desktop.update(patch));
  on(IpcChannel.desktopRelaunch, () => deps.relaunch());
  on(IpcChannel.appFlash, () => deps.window()?.flashFrame(true));
  on(IpcChannel.appNotify, (req: NotificationRequest) => {
    if (!Notification.isSupported()) return;
    const n = new Notification({ title: String(req.title).slice(0, 120), body: String(req.body).slice(0, 400), silent: Boolean(req.silent) });
    n.on('click', () => {
      const w = deps.window();
      w?.show();
      w?.focus();
      if (req.route) w?.webContents.send(IpcChannel.appNavigate, req.route);
    });
    n.show();
  });

  handle(IpcChannel.sessionLoad, () => sessionVault.load());
  handle(IpcChannel.sessionSave, (session: StoredSession) => sessionVault.save(session));
  handle(IpcChannel.sessionClear, () => sessionVault.clear());

  handle(IpcChannel.captureList, () => listCaptureSources());
  handle(IpcChannel.captureSelect, (selection: CaptureSelection) => selectCaptureSource(selection));

  handle(IpcChannel.hotkeyPtt, (keycode: number | null) => {
    const value = typeof keycode === 'number' ? keycode : null;
    saveMainSettings({ pushToTalkKeycode: value });
    return deps.pushToTalk.configure(value);
  });

  handle(IpcChannel.hotkeyGlobal, (specs: unknown) => deps.globalKeybinds.configure(sanitizeSpecs(specs)));

  handle(IpcChannel.updatesCheck, () => deps.updater.check());
  on(IpcChannel.updatesInstall, () => deps.updater.install());

  handle(IpcChannel.crypto, (method: string, args: unknown[]) => deps.crypto.invoke(method, Array.isArray(args) ? args : []));
}
