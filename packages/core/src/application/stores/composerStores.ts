/** Device-local composer state: per-channel drafts, trusted link domains and slowmode send times. */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { persistedStorage } from '../ports/deviceStorage';
import type { ChatMessage } from './messageStore';

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
    { name: 'discordy.drafts.v1', storage: persistedStorage() },
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
    { name: 'discordy.trusted-domains.v1', storage: persistedStorage() },
  ),
);

/** The reply bar's "@ ON/OFF" choice; Discord remembers the last one. */
interface ReplyPingState {
  ping: boolean;
  setPing(ping: boolean): void;
}

export const useReplyPingStore = create<ReplyPingState>()(
  persist((set) => ({ ping: true, setPing: (ping) => set({ ping }) }), { name: 'discordy.reply-ping.v1', storage: persistedStorage() }),
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
