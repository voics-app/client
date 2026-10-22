/** Main window with hardened web preferences, navigation guards and CSP. */
import { BrowserWindow, app, nativeTheme, session, shell } from 'electron';
import { join } from 'node:path';
import type { ConnectionProfile } from '../shared/ipc';
import { BRAND } from '../shared/brand';
import { buildCsp } from './csp';
import { configureSpellcheck, installTextContextMenu } from './textMenu';

const ALLOWED_PERMISSIONS = new Set(['media', 'display-capture', 'notifications', 'clipboard-sanitized-write', 'fullscreen']);

export function installSessionPolicies(getProfile: () => ConnectionProfile): void {
  const devServer = process.env.ELECTRON_RENDERER_URL ?? null;
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const isAppDocument = details.url.startsWith('file:') || (devServer !== null && details.url.startsWith(devServer));
    if (!isAppDocument) {
      callback({ responseHeaders: details.responseHeaders });
      return;
    }
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [buildCsp(getProfile(), devServer)],
      },
    });
  });
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(ALLOWED_PERMISSIONS.has(permission));
  });
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => ALLOWED_PERMISSIONS.has(permission));
}

export const CALL_POPOUT_FRAME = 'discordy-call-popout';

/** The only child window the renderer may open: the named about:blank call pop-out. */
export function isCallPopOut(url: string, frameName: string): boolean {
  return url === 'about:blank' && frameName === CALL_POPOUT_FRAME;
}

function callPopOutOptions(): Electron.BrowserWindowConstructorOptions {
  return {
    width: 1040,
    height: 680,
    minWidth: 480,
    minHeight: 320,
    autoHideMenuBar: true,
    title: BRAND.displayName,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#14141c' : '#eef0f5',
    icon: join(__dirname, '../../resources/icon.png'),
  };
}

export function createMainWindow(options: { startHidden?: boolean } = {}): BrowserWindow {
  const isMac = process.platform === 'darwin';
  const window = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 940,
    minHeight: 600,
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#14141c' : '#eef0f5',
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    titleBarOverlay: isMac ? false : { color: '#00000000', symbolColor: '#a9abc0', height: 36 },
    trafficLightPosition: { x: 16, y: 12 },
    icon: join(__dirname, '../../resources/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: true,
      backgroundThrottling: false,
      // Ringtone and sound effects are synthesised with Web Audio and must start without a click.
      autoplayPolicy: 'no-user-gesture-required',
    },
  });

  window.once('ready-to-show', () => {
    if (!options.startHidden) window.show();
  });
  window.webContents.on('will-navigate', (event, url) => {
    const devServer = process.env.ELECTRON_RENDERER_URL;
    if (!(devServer && url.startsWith(devServer))) event.preventDefault();
  });
  window.webContents.setWindowOpenHandler(({ url, frameName }) => {
    if (isCallPopOut(url, frameName)) return { action: 'allow', overrideBrowserWindowOptions: callPopOutOptions() };
    if (/^https:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  // The title carries the unread/mention count and is owned by the attention presenter, not the page.
  window.webContents.on('did-create-window', (child) => {
    // The pop-out is fed by the opener; it never navigates on its own.
    child.webContents.on('will-navigate', (event) => event.preventDefault());
    child.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    child.setMenuBarVisibility(false);
  });
  window.on('page-title-updated', (event) => event.preventDefault());
  window.setTitle(BRAND.displayName);
  installTextContextMenu(window.webContents);
  configureSpellcheck(window.webContents, app.getLocale());
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());

  if (process.env.ELECTRON_RENDERER_URL) void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  else void window.loadFile(join(__dirname, '../renderer/index.html'));
  return window;
}
