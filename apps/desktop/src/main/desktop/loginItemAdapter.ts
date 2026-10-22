/** Electron/OS adapter for the login-item port: registry on Windows, login items on macOS, XDG autostart on Linux. */
import { app } from 'electron';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { BRAND } from '../../shared/brand';
import { autostartDesktopEntry, loginArgs, type LoginItemPort } from './desktopSettings';

export function createLoginItemPort(platform: NodeJS.Platform = process.platform): LoginItemPort {
  return {
    apply(settings) {
      // A dev run would register the bare electron binary, so only packaged builds touch the OS.
      if (!app.isPackaged) return;
      if (platform === 'linux') {
        const file = join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'autostart', `${BRAND.appId}.desktop`);
        if (!settings.openAtLogin) {
          rmSync(file, { force: true });
          return;
        }
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, autostartDesktopEntry(BRAND.displayName, process.env.APPIMAGE ?? process.execPath, settings));
        return;
      }
      app.setLoginItemSettings({ openAtLogin: settings.openAtLogin, args: loginArgs(settings) });
    },
  };
}
