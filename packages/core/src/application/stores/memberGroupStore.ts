/** Which member list groups the user collapsed, per guild. Persisted to localStorage. */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { persistedStorage } from '../ports/deviceStorage';

interface MemberGroupState {
  collapsed: Record<string, string[]>;
  toggle(guildId: string, groupId: string): void;
}

export const useMemberGroupStore = create<MemberGroupState>()(
  persist(
    (set) => ({
      collapsed: {},
      toggle: (guildId, groupId) =>
        set((s) => {
          const cur = s.collapsed[guildId] ?? [];
          const next = cur.includes(groupId) ? cur.filter((g) => g !== groupId) : [...cur, groupId];
          return { collapsed: { ...s.collapsed, [guildId]: next } };
        }),
    }),
    { name: 'discordy.memberGroups', storage: persistedStorage() },
  ),
);
