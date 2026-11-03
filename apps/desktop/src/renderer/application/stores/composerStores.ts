/** Device-local composer state: per-channel drafts, trusted link domains and slowmode send times. */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { ChatMessage } from './messageStore';

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

export interface Draft {
  text: string;
  /** Snapshot of the message being replied to, so the reply bar can be restored after a restart. */
  replyTo: ChatMessage | null;
  updatedAt: number;
}

const MAX_DRAFTS = 100;

export interface DraftState {
  drafts: Record<string, Draft>;
  setDraft(channelId: string, text: string, replyTo: ChatMessage | null): void;
  clearDraft(channelId: string): void;
}

/** Drafts of standard-mode channels only: private modes promise that nothing is kept beyond their own storage. */
export const useDraftStore = create<DraftState>()(
  persist(
    (set) => ({
      drafts: {},
      setDraft: (channelId, text, replyTo) =>
        set((s) => {
          if (!text.trim() && !replyTo) {
            const { [channelId]: _gone, ...rest } = s.drafts;
            return { drafts: rest };
          }
          const next = { ...s.drafts, [channelId]: { text, replyTo, updatedAt: Date.now() } };
          const keys = Object.keys(next);
          if (keys.length > MAX_DRAFTS) {
            keys.sort((a, b) => next[a]!.updatedAt - next[b]!.updatedAt);
            for (const k of keys.slice(0, keys.length - MAX_DRAFTS)) delete next[k];
          }
          return { drafts: next };
        }),
      clearDraft: (channelId) =>
        set((s) => {
          const { [channelId]: _gone, ...rest } = s.drafts;
          return { drafts: rest };
        }),
    }),
    { name: 'discordy.drafts.v1', storage: createJSONStorage(storage) },
  ),
);

export interface TrustedDomainState {
  domains: string[];
  trust(domain: string): void;
}

export const useTrustedDomainStore = create<TrustedDomainState>()(
  persist(
    (set) => ({
      domains: [],
      trust: (domain) => set((s) => (s.domains.includes(domain) ? s : { domains: [...s.domains, domain].slice(-200) })),
    }),
    { name: 'discordy.trusted-domains.v1', storage: createJSONStorage(storage) },
  ),
);

/** The reply bar's "@ ON/OFF" choice; Discord remembers the last one. */
interface ReplyPingState {
  ping: boolean;
  setPing(ping: boolean): void;
}

export const useReplyPingStore = create<ReplyPingState>()(
  persist((set) => ({ ping: true, setPing: (ping) => set({ ping }) }), { name: 'discordy.reply-ping.v1', storage: createJSONStorage(storage) }),
);

export interface SlowmodeState {
  /** channelId -> epoch ms of the last message this user sent (or the server-reported cooldown end minus the rate). */
  lastSent: Record<string, number>;
  markSent(channelId: string, at?: number): void;
}

export const useSlowmodeStore = create<SlowmodeState>((set) => ({
  lastSent: {},
  markSent: (channelId, at = Date.now()) => set((s) => ({ lastSent: { ...s.lastSent, [channelId]: at } })),
}));
