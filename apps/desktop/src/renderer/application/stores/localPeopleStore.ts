/** Device-local per-user data: local voice mute (previous volume is kept to restore). Notes are synced (notificationSettingsStore). */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface LocalPeopleState {
  /** userId -> volume before the local mute. */
  mutedUsers: Record<string, number>;
  muteLocal(userId: string, previousVolume: number): void;
  unmuteLocal(userId: string): void;
}

function storage(): Storage {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  } catch {
    /* fall through to memory */
  }
  const mem = new Map<string, string>();
  return {
    getItem: (k) => mem.get(k) ?? null,
    setItem: (k, v) => void mem.set(k, v),
    removeItem: (k) => void mem.delete(k),
    clear: () => mem.clear(),
    key: () => null,
    length: 0,
  } as Storage;
}

export const useLocalPeopleStore = create<LocalPeopleState>()(
  persist(
    (set) => ({
      mutedUsers: {},
      muteLocal: (userId, previousVolume) => set((s) => ({ mutedUsers: { ...s.mutedUsers, [userId]: previousVolume } })),
      unmuteLocal: (userId) =>
        set((s) => {
          const { [userId]: _old, ...rest } = s.mutedUsers;
          return { mutedUsers: rest };
        }),
    }),
    { name: 'discordy.local-people.v1', storage: createJSONStorage(storage) },
  ),
);
