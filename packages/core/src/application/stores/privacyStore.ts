/** Private delivery-mode session status per channel (Ephemeral MLS groups and P2P links), plus Watch Together. */
import { create } from 'zustand';
import type { WatchTogetherPayload } from '../../contracts/gateway';

export type P2PLinkState = 'idle' | 'connecting' | 'open' | 'peer_offline' | 'failed' | 'unverified';
export type GroupState = 'none' | 'establishing' | 'ready' | 'error';

export interface PrivacyState {
  p2p: Record<string, { state: P2PLinkState; verified: boolean; detail?: string }>;
  groups: Record<string, { state: GroupState; epoch: number; detail?: string }>;
  watch: Record<string, WatchTogetherPayload | null>;
  /** Disappearing-message timer per private chat in ms; a chat without an entry keeps its messages. */
  timers: Record<string, number>;
  serverOffsetMs: number;
  setP2P(channelId: string, state: P2PLinkState, verified?: boolean, detail?: string): void;
  setGroup(channelId: string, state: GroupState, epoch?: number, detail?: string): void;
  setWatch(channelId: string, anchor: WatchTogetherPayload | null): void;
  setTimer(channelId: string, ttlMs: number | null): void;
  loadTimers(timers: Record<string, number>): void;
  setServerOffset(ms: number): void;
}

export const usePrivacyStore = create<PrivacyState>((set) => ({
  p2p: {},
  groups: {},
  watch: {},
  timers: {},
  serverOffsetMs: 0,
  setP2P: (channelId, state, verified, detail) =>
    set((s) => ({ p2p: { ...s.p2p, [channelId]: { state, verified: verified ?? s.p2p[channelId]?.verified ?? false, detail } } })),
  setGroup: (channelId, state, epoch, detail) =>
    set((s) => ({ groups: { ...s.groups, [channelId]: { state, epoch: epoch ?? s.groups[channelId]?.epoch ?? 0, detail } } })),
  setWatch: (channelId, anchor) => set((s) => ({ watch: { ...s.watch, [channelId]: anchor } })),
  setTimer: (channelId, ttlMs) =>
    set((s) => {
      const { [channelId]: _old, ...rest } = s.timers;
      return { timers: ttlMs ? { ...rest, [channelId]: ttlMs } : rest };
    }),
  loadTimers: (timers) => set({ timers }),
  setServerOffset: (serverOffsetMs) => set({ serverOffsetMs }),
}));
