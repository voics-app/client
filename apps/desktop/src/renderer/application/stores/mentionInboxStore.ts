/** Mentions inbox entries gathered from live messages and loaded history; kept on this device. */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { persistedStorage } from '@renderer/application/ports/deviceStorage';
import { addInboxEntries, addInboxEntry, type InboxEntry } from '@renderer/domain/mentionInbox';

export interface MentionInboxState {
  entries: InboxEntry[];
  add(entry: InboxEntry): void;
  addMany(entries: InboxEntry[]): void;
  remove(id: string): void;
  clear(): void;
}

export const useMentionInboxStore = create<MentionInboxState>()(
  persist(
    (set) => ({
      entries: [],
      add: (entry) => set((s) => ({ entries: addInboxEntry(s.entries, entry) })),
      addMany: (entries) => set((s) => ({ entries: addInboxEntries(s.entries, entries) })),
      remove: (id) => set((s) => ({ entries: s.entries.filter((e) => e.id !== id) })),
      clear: () => set({ entries: [] }),
    }),
    { name: 'discordy.mention-inbox.v1', storage: persistedStorage() },
  ),
);
