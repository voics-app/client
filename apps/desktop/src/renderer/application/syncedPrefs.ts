/**
 * Keeps the synced preferences (domain/syncedPrefs) in step with the server (client#123).
 * The prefs store stays the one thing the UI reads; it is persisted to localStorage, which acts as
 * the cache until READY arrives. Local edits are sent as a debounced PATCH with only the changed
 * keys; a refused PATCH rolls the keys back. READY and USER_SETTINGS_UPDATE flow the other way.
 * On the first READY of an account on this device, values the user changed locally before sync
 * existed are migrated up when the server still has nothing for them.
 */
import type { UserSettings } from '@shared/contracts/rest';
import { SYNCED_KEYS, fromServer, sameValue, serverIsDefault, syncedSlice, toServerPatch, type SyncedKey } from './syncedPrefsMap';
import { deviceStorage, type KeyValueStorage } from './ports/deviceStorage';
import { DEFAULT_PREFS, usePrefsStore, type PrefsData } from './stores/prefsStore';

export interface PrefsSyncDeps {
  updateSettings(patch: Partial<UserSettings>): Promise<unknown>;
  onError(error: unknown): void;
  debounceMs?: number;
  storage?: Pick<KeyValueStorage, 'getItem' | 'setItem'>;
}

type Slice = Pick<PrefsData, SyncedKey>;
type Loose = Record<string, unknown>;

export class PrefsSync {
  private confirmed: Slice | null = null;
  private inflight = new Set<SyncedKey>();
  private applying = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly deps: PrefsSyncDeps) {}

  start(): void {
    this.unsubscribe ??= usePrefsStore.subscribe(() => {
      if (!this.applying) this.recompute();
    });
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.confirmed = null;
    this.inflight.clear();
  }

  /** READY (`ready: true`) or USER_SETTINGS_UPDATE for this account. */
  onSettings(settings: Partial<UserSettings> | undefined, ready: boolean, userId?: string): void {
    const server = fromServer(settings) as Loose;
    const local = syncedSlice(usePrefsStore.getState());
    const migrate = new Set<SyncedKey>();
    if (ready && userId) {
      const flag = `discordy.prefs-sync.migrated.${userId}`;
      const storage = this.deps.storage ?? deviceStorage;
      let done = true;
      try { done = storage?.getItem(flag) === '1'; } catch { done = true; }
      if (!done) {
        for (const key of SYNCED_KEYS) if (!sameValue(local[key], DEFAULT_PREFS[key]) && serverIsDefault(key, server as Partial<PrefsData>)) migrate.add(key);
        try { storage?.setItem(flag, '1'); } catch { /* migration reruns next start; harmless */ }
      }
    }
    const baseline: Loose = { ...(this.confirmed ?? local) };
    const apply: Loose = {};
    for (const key of SYNCED_KEYS) {
      if (this.inflight.has(key)) continue;
      const serverValue = server[key];
      if (migrate.has(key)) {
        baseline[key] = serverValue ?? DEFAULT_PREFS[key];
        continue;
      }
      if (serverValue === undefined) continue;
      const edited = this.confirmed !== null && !sameValue(local[key], this.confirmed[key]);
      baseline[key] = serverValue;
      if (!edited) apply[key] = serverValue;
    }
    this.confirmed = baseline as Slice;
    if (Object.keys(apply).length) this.withoutEcho(() => usePrefsStore.setState(apply as Partial<PrefsData>));
    this.recompute();
  }

  private withoutEcho(run: () => void): void {
    this.applying = true;
    try { run(); } finally { this.applying = false; }
  }

  private changedKeys(): SyncedKey[] {
    const confirmed = this.confirmed;
    if (!confirmed) return [];
    const local = syncedSlice(usePrefsStore.getState());
    return SYNCED_KEYS.filter((k) => !this.inflight.has(k) && !sameValue(local[k], confirmed[k]));
  }

  private recompute(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (!this.changedKeys().length) return;
    this.timer = setTimeout(() => void this.flush(), this.deps.debounceMs ?? 600);
  }

  /** Sends pending changes now. */
  async flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const keys = this.changedKeys();
    if (!keys.length) return;
    const sent = syncedSlice(usePrefsStore.getState());
    keys.forEach((k) => this.inflight.add(k));
    try {
      await this.deps.updateSettings(toServerPatch(keys, sent));
      if (this.confirmed) for (const k of keys) (this.confirmed as Loose)[k] = sent[k];
    } catch (error) {
      const now = syncedSlice(usePrefsStore.getState());
      const revert: Loose = {};
      if (this.confirmed) for (const k of keys) if (sameValue(now[k], sent[k])) revert[k] = this.confirmed[k];
      this.withoutEcho(() => usePrefsStore.setState(revert as Partial<PrefsData>));
      this.deps.onError(error);
    } finally {
      keys.forEach((k) => this.inflight.delete(k));
      this.recompute();
    }
  }
}
