/** electron-updater against the generic feed at UPDATE_FEED_URL (MinIO bucket). */
import { app } from 'electron';
import { autoUpdater } from 'electron-updater';
import type { UpdateStatus } from '../shared/ipc';

export class Updater {
  constructor(
    feedUrl: string,
    private readonly publish: (status: UpdateStatus) => void,
  ) {
    autoUpdater.setFeedURL({ provider: 'generic', url: feedUrl, channel: 'latest' });
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on('checking-for-update', () => publish({ state: 'checking' }));
    autoUpdater.on('update-available', (i) => publish({ state: 'available', version: i.version }));
    autoUpdater.on('update-not-available', () => publish({ state: 'not-available' }));
    autoUpdater.on('download-progress', (p) => publish({ state: 'downloading', percent: Math.round(p.percent) }));
    autoUpdater.on('update-downloaded', (i) => publish({ state: 'downloaded', version: i.version }));
    autoUpdater.on('error', (e) => publish({ state: 'error', message: e.message }));
  }

  async check(): Promise<void> {
    if (!app.isPackaged) {
      this.publish({ state: 'not-available' });
      return;
    }
    await autoUpdater.checkForUpdates();
  }

  install(): void {
    autoUpdater.quitAndInstall();
  }
}
