/** Owns the device-local desktop settings: validation, persistence and applying them to the OS. */
import type { DesktopSettings } from '../../shared/ipc';
import { needsRestart, normalizeDesktopSettings, type LoginItemPort } from './desktopSettings';

export interface DesktopStore {
  load(): unknown;
  save(settings: DesktopSettings): void;
}

export class DesktopService {
  private current: DesktopSettings;

  constructor(
    store: DesktopStore,
    private readonly loginItem: LoginItemPort,
    private readonly platform: NodeJS.Platform,
    private readonly persist: (settings: DesktopSettings) => void = (s) => store.save(s),
  ) {
    this.current = normalizeDesktopSettings(store.load(), platform);
  }

  get(): DesktopSettings {
    return this.current;
  }

  /** Re-registers the login item so the stored choice survives reinstalls and path changes. */
  sync(): void {
    this.loginItem.apply(this.current);
  }

  update(patch: unknown): { settings: DesktopSettings; restartRequired: boolean } {
    const extra = typeof patch === 'object' && patch !== null ? patch : {};
    const next = normalizeDesktopSettings({ ...this.current, ...extra }, this.platform);
    const restartRequired = needsRestart(this.current, next);
    this.current = next;
    this.persist(next);
    this.sync();
    return { settings: next, restartRequired };
  }
}
