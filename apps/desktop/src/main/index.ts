/** Main-process composition root. */
import type { BrowserWindow} from 'electron';
import { app } from 'electron';
import { resolve } from 'node:path';
import { IpcChannel, type AppInfo, type ConnectionProfile } from '../shared/ipc';
import { installDisplayMediaHandler } from './capture';
import { resolveConnection, resolveUpdateFeed } from './config';
import { CryptoHost } from './cryptoHost';
import { DeepLinkInbox, PROTOCOL, findDeepLink, routeFromDeepLink } from './deepLinks';
import { PushToTalk } from './hotkeys';
import { registerIpc } from './ipc';
import { loadMainSettings, saveMainSettings } from './settings';
import { DesktopService } from './desktop/desktopService';
import { createLoginItemPort } from './desktop/loginItemAdapter';
import { normalizeDesktopSettings, shouldHideOnClose, shouldStartHidden } from './desktop/desktopSettings';
import { AttentionPresenter } from './attention/presenter';
import { createElectronAttentionPort } from './attention/electronAdapter';
import { createTray, type TrayHandle } from './tray';
import { Updater, createElectronUpdaterPort } from './updater';
import { createMainWindow, installSessionPolicies } from './window';
import { BRAND } from '../shared/brand';

if (process.env.DISCORDY_USER_DATA_DIR) app.setPath('userData', process.env.DISCORDY_USER_DATA_DIR);

const env = process.env as Record<string, string | undefined>;

// Hardware acceleration can only be switched before the app is ready, so it is read from the local settings file first.
const desktopSettings = normalizeDesktopSettings(loadMainSettings().desktop, process.platform);
if (!desktopSettings.hardwareAcceleration) app.disableHardwareAcceleration();

let mainWindow: BrowserWindow | null = null;
let quitting = false;
let trayHandle: TrayHandle | null = null;
const inbox = new DeepLinkInbox();

function navigate(link: string | null): void {
  const route = link ? routeFromDeepLink(link) : null;
  if (!route) return;
  inbox.submit(route, (r) => mainWindow?.webContents.send(IpcChannel.appNavigate, r));
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
}

function registerProtocol(): void {
  if (process.defaultApp && process.argv[1]) {
    app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [resolve(process.argv[1])]);
  } else {
    app.setAsDefaultProtocolClient(PROTOCOL);
  }
}

function bootstrap(): void {
  const settings = loadMainSettings();
  let connection: ConnectionProfile = resolveConnection(env, settings.connection);
  const updateFeedUrl = resolveUpdateFeed(env);
  const getWindow = () => mainWindow;

  const info = (): AppInfo => ({
    version: app.getVersion(),
    platform: process.platform,
    updateFeedUrl,
    connection,
    e2eTest: env.DISCORDY_E2E === '1',
  });

  installSessionPolicies(() => connection);
  installDisplayMediaHandler();

  const pushToTalk = new PushToTalk(getWindow);
  if (settings.pushToTalkKeycode !== null) pushToTalk.configure(settings.pushToTalkKeycode);
  const updater = new Updater(createElectronUpdaterPort(updateFeedUrl), (status) => mainWindow?.webContents.send(IpcChannel.updatesStatus, status));
  const desktop = new DesktopService({ load: () => settings.desktop, save: () => undefined }, createLoginItemPort(), process.platform, (s) => {
    saveMainSettings({ desktop: s });
  });
  desktop.sync();
  const startHidden = env.DISCORDY_E2E !== '1' && shouldStartHidden(desktop.get(), process.argv, app.getLoginItemSettings().wasOpenedAtLogin);

  const attention = new AttentionPresenter(
    createElectronAttentionPort(getWindow, () => trayHandle),
    BRAND.displayName,
    () => trayHandle?.baseBitmap ?? null,
    process.platform,
  );

  registerIpc({
    window: getWindow,
    setActivity: (counts) => {
      attention.apply(counts);
      trayHandle?.setActivity(counts);
    },
    setVoiceState: (state) => trayHandle?.setVoice(state),
    desktop,
    relaunch: () => {
      quitting = true;
      app.relaunch();
      app.quit();
    },
    info,
    setConnection: (profile) => {
      connection = profile;
    },
    crypto: new CryptoHost(),
    pushToTalk,
    updater,
    takePendingRoute: () => inbox.take(),
  });

  mainWindow = createMainWindow({ startHidden });
  mainWindow.on('close', (event) => {
    if (shouldHideOnClose(desktop.get(), { quitting, hasTray: trayHandle !== null, e2e: env.DISCORDY_E2E === '1' })) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  if (env.DISCORDY_E2E !== '1') {
    trayHandle = createTray(
      getWindow,
      () => {
        quitting = true;
        app.quit();
      },
      (command) => mainWindow?.webContents.send(IpcChannel.appTrayCommand, command),
    );
    updater.start();
  }

  app.on('before-quit', () => {
    quitting = true;
    updater.stop();
    pushToTalk.dispose();
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    navigate(findDeepLink(argv));
    mainWindow?.show();
    mainWindow?.focus();
  });
  app.on('open-url', (event, url) => {
    event.preventDefault();
    navigate(url);
  });
  app.setAppUserModelId(BRAND.appId);
  registerProtocol();
  navigate(findDeepLink(process.argv));

  void app.whenReady().then(() => {
    bootstrap();
    app.on('activate', () => mainWindow?.show());
  });
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
