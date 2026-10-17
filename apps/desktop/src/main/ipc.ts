/** IPC handlers: the only path from the sandboxed renderer to privileged APIs. */
import { BrowserWindow, Notification, app, ipcMain, shell } from 'electron';
import { IpcChannel, type AppInfo, type ConnectionProfile, type NotificationRequest, type StoredSession, type CaptureSelection } from '../shared/ipc';
import { validateProfile } from './config';
import { listCaptureSources, selectCaptureSource } from './capture';
import type { CryptoHost } from './cryptoHost';
import type { PushToTalk } from './hotkeys';
import { sessionVault } from './sessionVault';
import { saveMainSettings } from './settings';
import type { Updater } from './updater';

export interface IpcDeps {
  window: () => BrowserWindow | null;
  info: () => AppInfo;
  setConnection: (profile: ConnectionProfile) => void;
  crypto: CryptoHost;
  pushToTalk: PushToTalk;
  updater: Updater;
}

function assertTrustedSender(event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent, deps: IpcDeps): void {
  if (event.sender !== deps.window()?.webContents) throw new Error('IPC from untrusted sender');
}

export function registerIpc(deps: IpcDeps): void {
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
  handle(IpcChannel.appSetConnection, (profile: ConnectionProfile) => {
    const valid = validateProfile(profile);
    saveMainSettings({ connection: valid });
    deps.setConnection(valid);
    return deps.info();
  });
  handle(IpcChannel.appOpenExternal, async (url: string) => {
    if (typeof url === 'string' && /^https:\/\//.test(url)) await shell.openExternal(url);
  });
  on(IpcChannel.appBadge, (count: number) => {
    app.setBadgeCount(Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0);
  });
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

  handle(IpcChannel.updatesCheck, () => deps.updater.check());
  on(IpcChannel.updatesInstall, () => deps.updater.install());

  handle(IpcChannel.crypto, (method: string, args: unknown[]) => deps.crypto.invoke(method, Array.isArray(args) ? args : []));
}
