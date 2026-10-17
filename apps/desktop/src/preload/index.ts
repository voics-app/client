/** Preload: exposes the typed `window.discordy` bridge. No Node APIs leak to the renderer. */
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { IpcChannel, type CryptoBridge, type CryptoMethod, type DiscordyBridge, type UpdateStatus } from '../shared/ipc';

function subscribe<T>(channel: string, listener: (value: T) => void): () => void {
  const wrapped = (_event: IpcRendererEvent, value: T) => listener(value);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
}

const cryptoMethods: CryptoMethod[] = [
  'status',
  'initialise',
  'sign',
  'verify',
  'generateKeyPackages',
  'hasGroup',
  'createGroup',
  'addMembers',
  'joinFromWelcome',
  'encrypt',
  'processIncoming',
  'exportSecret',
  'putMessage',
  'listMessages',
  'deleteMessage',
];

const crypto = Object.fromEntries(
  cryptoMethods.map((method) => [method, (...args: unknown[]) => ipcRenderer.invoke(IpcChannel.crypto, method, args)]),
) as unknown as CryptoBridge;

const bridge: DiscordyBridge = {
  app: {
    info: () => ipcRenderer.invoke(IpcChannel.appInfo),
    setConnection: (profile) => ipcRenderer.invoke(IpcChannel.appSetConnection, profile),
    openExternal: (url) => ipcRenderer.invoke(IpcChannel.appOpenExternal, url),
    setBadgeCount: (count) => ipcRenderer.send(IpcChannel.appBadge, count),
    notify: (request) => ipcRenderer.send(IpcChannel.appNotify, request),
    onNavigate: (listener) => subscribe<string>(IpcChannel.appNavigate, listener),
    flashFrame: () => ipcRenderer.send(IpcChannel.appFlash),
  },
  session: {
    load: () => ipcRenderer.invoke(IpcChannel.sessionLoad),
    save: (session) => ipcRenderer.invoke(IpcChannel.sessionSave, session),
    clear: () => ipcRenderer.invoke(IpcChannel.sessionClear),
  },
  capture: {
    listSources: () => ipcRenderer.invoke(IpcChannel.captureList),
    select: (selection) => ipcRenderer.invoke(IpcChannel.captureSelect, selection),
  },
  hotkeys: {
    setPushToTalk: (keycode) => ipcRenderer.invoke(IpcChannel.hotkeyPtt, keycode),
    onPushToTalk: (listener) => subscribe<boolean>(IpcChannel.hotkeyPttEvent, listener),
  },
  updates: {
    check: () => ipcRenderer.invoke(IpcChannel.updatesCheck),
    install: () => ipcRenderer.send(IpcChannel.updatesInstall),
    onStatus: (listener) => subscribe<UpdateStatus>(IpcChannel.updatesStatus, listener),
  },
  crypto,
};

contextBridge.exposeInMainWorld('discordy', bridge);
