/** Device-local per-user data: local voice mute (previous volume is kept to restore). Notes are synced (notificationSettingsStore). */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { persistedStorage } from '@renderer/application/ports/deviceStorage';

export interface LocalPeopleState {
  /** userId -> volume before the local mute. */
  mutedUsers: Record<string, number>;
  muteLocal(userId: string, previousVolume: number): void;
  unmuteLocal(userId: string): void;
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
    { name: 'discordy.local-people.v1', storage: persistedStorage() },
  ),
);
