/** Preload: exposes the typed `window.discordy` bridge. No Node APIs leak to the renderer. */
import { contextBridge, ipcRenderer, webFrame, type IpcRendererEvent } from 'electron';
import { IpcChannel, type CryptoBridge, type CryptoMethod, type DiscordyBridge, type TrayCommand, type UpdateStatus } from '../shared/ipc';

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
  'deleteGroup',
  'createGroup',
  'addMembers',
  'memberKeys',
  'removeMembers',
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
  passkeys: {
    site: () => ipcRenderer.invoke(IpcChannel.passkeySite),
    perform: (request) => ipcRenderer.invoke(IpcChannel.passkeyPerform, request),
    cancel: (id) => ipcRenderer.invoke(IpcChannel.passkeyCancel, id),
  },
  app: {
    info: () => ipcRenderer.invoke(IpcChannel.appInfo),
    setConnection: (profile) => ipcRenderer.invoke(IpcChannel.appSetConnection, profile),
    openExternal: (url) => ipcRenderer.invoke(IpcChannel.appOpenExternal, url),
    setActivity: (counts) => ipcRenderer.send(IpcChannel.appActivity, counts),
    notify: (request) => ipcRenderer.send(IpcChannel.appNotify, request),
    onNavigate: (listener) => subscribe<string>(IpcChannel.appNavigate, listener),
    takePendingRoute: () => ipcRenderer.invoke(IpcChannel.appTakePendingRoute),
    flashFrame: () => ipcRenderer.send(IpcChannel.appFlash),
    setZoom: (factor) => webFrame.setZoomFactor(Math.min(2, Math.max(0.5, Number(factor) || 1))),
    setVoiceState: (state) => ipcRenderer.send(IpcChannel.appVoiceState, state),
    onTrayCommand: (listener) => subscribe<TrayCommand>(IpcChannel.appTrayCommand, listener),
    obsRunning: () => ipcRenderer.invoke(IpcChannel.obsRunning),
  },
  idle: {
    seconds: () => ipcRenderer.invoke(IpcChannel.idleSeconds),
    onLock: (listener) => subscribe<boolean>(IpcChannel.idleLock, listener),
  },
  desktop: {
    get: () => ipcRenderer.invoke(IpcChannel.desktopGet),
    set: (patch) => ipcRenderer.invoke(IpcChannel.desktopSet, patch),
    relaunch: () => ipcRenderer.send(IpcChannel.desktopRelaunch),
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
    setGlobalKeybinds: (specs) => ipcRenderer.invoke(IpcChannel.hotkeyGlobal, specs),
    onGlobalKeybind: (listener) => subscribe<{ id: string; pressed: boolean }>(IpcChannel.hotkeyGlobalEvent, listener),
  },
  updates: {
    check: () => ipcRenderer.invoke(IpcChannel.updatesCheck),
    install: () => ipcRenderer.send(IpcChannel.updatesInstall),
    onStatus: (listener) => subscribe<UpdateStatus>(IpcChannel.updatesStatus, listener),
  },
  crypto,
};

contextBridge.exposeInMainWorld('discordy', bridge);
