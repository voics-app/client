/** Main-process composition root. */
import type { BrowserWindow} from 'electron';
import { app, powerMonitor } from 'electron';
import { resolve } from 'node:path';
import { IpcChannel, type AppInfo, type ConnectionProfile } from '../shared/ipc';
import { installDisplayMediaHandler } from './capture';
import { resolveConnection, resolveUpdateFeed } from './config';
import { CryptoHost } from './cryptoHost';
import { DeepLinkInbox, PROTOCOL, findDeepLink, routeFromDeepLink } from './deepLinks';
import { GlobalKeybinds, HookHub, PushToTalk } from './hotkeys';
import { registerIpc } from './ipc';
import { loadMainSettings, saveMainSettings } from './settings';
import { DesktopService } from './desktop/desktopService';
import { createLoginItemPort } from './desktop/loginItemAdapter';
import { normalizeDesktopSettings, shouldHideOnClose, shouldHideOnMinimize, shouldStartHidden } from './desktop/desktopSettings';
import { AttentionPresenter } from './attention/presenter';
import { createElectronAttentionPort } from './attention/electronAdapter';
import { createTrayController } from './trayController';
import { Updater, createElectronUpdaterPort } from './updater';
import { legacyUserDataDir, migrateLegacyUserData } from './userDataMigration';
import { createMainWindow, installSessionPolicies } from './window';
import { BRAND } from '../shared/brand';

if (process.env.DISCORDY_USER_DATA_DIR) {
  app.setPath('userData', process.env.DISCORDY_USER_DATA_DIR);
} else {
  // Before anything reads userData: the rebrand moved the folder (the old name is a constant there).
  const userData = app.getPath('userData');
  migrateLegacyUserData(legacyUserDataDir(userData), userData);
}

const env = process.env as Record<string, string | undefined>;

// Hardware acceleration can only be switched before the app is ready, so it is read from the local settings file first.
const desktopSettings = normalizeDesktopSettings(loadMainSettings().desktop, process.platform);
if (!desktopSettings.hardwareAcceleration) app.disableHardwareAcceleration();

let mainWindow: BrowserWindow | null = null;
let quitting = false;
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

  const hookHub = new HookHub();
  const pushToTalk = new PushToTalk(getWindow, hookHub);
  const globalKeybinds = new GlobalKeybinds(getWindow, hookHub);
  if (settings.pushToTalkKeycode !== null) pushToTalk.configure(settings.pushToTalkKeycode);
  const updater = new Updater(createElectronUpdaterPort(updateFeedUrl), (status) => mainWindow?.webContents.send(IpcChannel.updatesStatus, status));
  const e2e = env.DISCORDY_E2E === '1';
  const trayController = createTrayController({
    getWindow,
    e2e,
    actions: {
      onQuit: () => {
        quitting = true;
        app.quit();
      },
      onCheckUpdates: () => void updater.check(),
      onCommand: (command) => mainWindow?.webContents.send(IpcChannel.appTrayCommand, command),
    },
    onCreated: (counts) => attention.apply(counts),
  });
  const desktop = new DesktopService({ load: () => settings.desktop, save: () => undefined }, createLoginItemPort(), process.platform, (s) => {
    saveMainSettings({ desktop: s });
    trayController.apply(s);
  });
  desktop.sync();
  const startHidden = env.DISCORDY_E2E !== '1' && shouldStartHidden(desktop.get(), process.argv, app.getLoginItemSettings().wasOpenedAtLogin);

  const attention = new AttentionPresenter(
    createElectronAttentionPort(getWindow, trayController.handle),
    BRAND.displayName,
    () => trayController.handle()?.baseBitmap ?? null,
    process.platform,
  );

  registerIpc({
    window: getWindow,
    setActivity: (counts) => {
      trayController.setActivity(counts);
      attention.apply(counts);
    },
    setVoiceState: trayController.setVoice,
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
    globalKeybinds,
    updater,
    takePendingRoute: () => inbox.take(),
  });

  mainWindow = createMainWindow({ startHidden });
  const sendLock = (locked: boolean) => mainWindow?.webContents.send(IpcChannel.idleLock, locked);
  powerMonitor.on('lock-screen', () => sendLock(true));
  powerMonitor.on('suspend', () => sendLock(true));
  powerMonitor.on('unlock-screen', () => sendLock(false));
  powerMonitor.on('resume', () => sendLock(false));
  mainWindow.on('close', (event) => {
    if (shouldHideOnClose(desktop.get(), { quitting, hasTray: trayController.handle() !== null, e2e })) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });
  mainWindow.on('minimize', () => {
    if (shouldHideOnMinimize(desktop.get(), { quitting, hasTray: trayController.handle() !== null, e2e })) mainWindow?.hide();
  });

  trayController.apply(desktop.get());
  if (!e2e) updater.start();

  app.on('before-quit', () => {
    quitting = true;
    updater.stop();
    pushToTalk.dispose();
    globalKeybinds.dispose();
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

  // Belt and braces with the window's autoplayPolicy: no web contents may block audio that lacks a click.
  app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
  void app.whenReady().then(() => {
    bootstrap();
    app.on('activate', () => mainWindow?.show());
  });
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
