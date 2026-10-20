/**
 * Server-synced notification settings (per guild and DMs) and private user notes. The server is the
 * source of truth (READY and the USER_GUILD_SETTINGS_UPDATE / USER_NOTE_UPDATE dispatches); the
 * persisted copy is a cache so the last known state is available before READY arrives.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { GuildNotificationSettings } from '@shared/contracts/rest';
import { scopeKey } from '@renderer/domain/notificationSettings';

function memoryStorage() {
  const memory = new Map<string, string>();
  return {
    getItem: (k: string) => memory.get(k) ?? null,
    setItem: (k: string, v: string) => void memory.set(k, v),
    removeItem: (k: string) => void memory.delete(k),
  };
}

function browserStorage() {
  try {
    const probe = '__discordy_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return memoryStorage();
  }
}

const storage = createJSONStorage(() => (typeof window === 'undefined' ? memoryStorage() : browserStorage()));

export interface NotificationSettingsState {
  /** Keyed by guild id, or '@me' for DMs. */
  byScope: Record<string, GuildNotificationSettings>;
  /** READY: replaces everything (guilds without a row use the defaults). */
  hydrate(list: GuildNotificationSettings[]): void;
  upsert(settings: GuildNotificationSettings): void;
  reset(): void;
}

export const useNotificationSettingsStore = create<NotificationSettingsState>()(
  persist(
    (set) => ({
      byScope: {},
      hydrate: (list) => set({ byScope: Object.fromEntries(list.map((s) => [scopeKey(s.guild_id), s])) }),
      upsert: (settings) => set((s) => ({ byScope: { ...s.byScope, [scopeKey(settings.guild_id)]: settings } })),
      reset: () => set({ byScope: {} }),
    }),
    { name: 'discordy.notification-settings.v1', storage },
  ),
);

export interface UserNotesState {
  /** Keyed by the noted user's id. */
  byUser: Record<string, string>;
  hydrate(notes: Record<string, string>): void;
  /** An empty note removes the entry. */
  set(userId: string, note: string): void;
  reset(): void;
}

export const useUserNotesStore = create<UserNotesState>()(
  persist(
    (set) => ({
      byUser: {},
      hydrate: (notes) => set({ byUser: { ...notes } }),
      set: (userId, note) =>
        set((s) => {
          const { [userId]: _old, ...rest } = s.byUser;
          return { byUser: note ? { ...rest, [userId]: note } : rest };
        }),
      reset: () => set({ byUser: {} }),
    }),
    { name: 'discordy.user-notes.v1', storage },
  ),
);
