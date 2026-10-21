/** Mentions inbox entries gathered from live messages and loaded history; kept on this device. */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { addInboxEntries, addInboxEntry, type InboxEntry } from '@renderer/domain/mentionInbox';

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
    window.localStorage.setItem('__p', '1');
    window.localStorage.removeItem('__p');
    return window.localStorage;
  } catch {
    return memoryStorage();
  }
}

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
    { name: 'discordy.mention-inbox.v1', storage: createJSONStorage(() => (typeof window === 'undefined' ? memoryStorage() : browserStorage())) },
  ),
);
