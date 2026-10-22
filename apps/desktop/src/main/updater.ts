/** Update flow: check on launch and periodically against the generic feed, download, then offer a restart. */
import { app } from 'electron';
import { autoUpdater } from 'electron-updater';
import type { UpdateStatus } from '../shared/ipc';

export const UPDATE_INTERVAL_MS = 4 * 60 * 60 * 1000;
export const FIRST_CHECK_DELAY_MS = 10_000;

export interface UpdateInfoLike {
  version: string;
  releaseNotes?: string | ReadonlyArray<{ note?: string | null }> | null;
}

/** Port over electron-updater so the flow is testable. */
export interface UpdaterPort {
  isEnabled(): boolean;
  check(): Promise<unknown>;
  quitAndInstall(): void;
  on(event: 'checking' | 'none', listener: () => void): void;
  on(event: 'available' | 'downloaded', listener: (info: UpdateInfoLike) => void): void;
  on(event: 'progress', listener: (percent: number) => void): void;
  on(event: 'error', listener: (error: Error) => void): void;
}

/** electron-updater returns notes as HTML/markdown text or a per-version list; the UI shows plain text. */
export function releaseNotesText(notes: UpdateInfoLike['releaseNotes']): string | undefined {
  const raw = typeof notes === 'string' ? notes : Array.isArray(notes) ? notes.map((n) => n.note ?? '').join('\n\n') : '';
  const text = raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text ? text.slice(0, 4000) : undefined;
}

export class Updater {
  private timer: ReturnType<typeof setInterval> | null = null;
  private first: ReturnType<typeof setTimeout> | null = null;
  private status: UpdateStatus = { state: 'idle' };

  constructor(
    private readonly port: UpdaterPort,
    private readonly publishStatus: (status: UpdateStatus) => void,
  ) {
    const set = (s: UpdateStatus) => {
      this.status = s;
      publishStatus(s);
    };
    port.on('checking', () => set({ state: 'checking' }));
    port.on('available', (i) => set({ state: 'available', version: i.version, notes: releaseNotesText(i.releaseNotes) }));
    port.on('none', () => set({ state: 'not-available' }));
    port.on('progress', (percent) => set({ state: 'downloading', percent: Math.round(percent) }));
    port.on('downloaded', (i) => set({ state: 'downloaded', version: i.version, notes: releaseNotesText(i.releaseNotes) }));
    port.on('error', (e) => set({ state: 'error', message: e.message }));
  }

  current(): UpdateStatus {
    return this.status;
  }

  async check(): Promise<void> {
    if (!this.port.isEnabled()) {
      this.publishStatus({ state: 'not-available' });
      return;
    }
    // Never restart a download that is already finished or running.
    if (this.status.state === 'downloaded' || this.status.state === 'downloading') {
      this.publishStatus(this.status);
      return;
    }
    await this.port.check();
  }

  /** Checks shortly after launch and then on a fixed interval. */
  start(schedule: { delayMs?: number; intervalMs?: number } = {}): void {
    this.stop();
    const run = () => void this.check().catch(() => undefined);
    this.first = setTimeout(run, schedule.delayMs ?? FIRST_CHECK_DELAY_MS);
    this.timer = setInterval(run, schedule.intervalMs ?? UPDATE_INTERVAL_MS);
  }

  stop(): void {
    if (this.first) clearTimeout(this.first);
    if (this.timer) clearInterval(this.timer);
    this.first = null;
    this.timer = null;
  }

  install(): void {
    this.port.quitAndInstall();
  }
}

type Listener = (...args: unknown[]) => void;

export function createElectronUpdaterPort(feedUrl: string): UpdaterPort {
  autoUpdater.setFeedURL({ provider: 'generic', url: feedUrl, channel: 'latest' });
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  const events = autoUpdater as unknown as { on(event: string, listener: Listener): void };
  const names: Record<string, string> = {
    checking: 'checking-for-update',
    none: 'update-not-available',
    available: 'update-available',
    downloaded: 'update-downloaded',
    progress: 'download-progress',
    error: 'error',
  };
  return {
    isEnabled: () => app.isPackaged,
    check: () => autoUpdater.checkForUpdates(),
    quitAndInstall: () => autoUpdater.quitAndInstall(),
    on: ((event: string, listener: Listener) => {
      const name = names[event] ?? event;
      if (event === 'progress') events.on(name, (p) => listener((p as { percent: number }).percent));
      else events.on(name, listener);
    }) as UpdaterPort['on'],
  };
}
