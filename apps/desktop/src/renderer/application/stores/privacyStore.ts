/** Private delivery-mode session status per channel (Ephemeral MLS groups and P2P links), plus Watch Together. */
import { create } from 'zustand';
import type { WatchTogetherPayload } from '@shared/contracts/gateway';

export type P2PLinkState = 'idle' | 'connecting' | 'open' | 'peer_offline' | 'failed' | 'unverified';
export type GroupState = 'none' | 'establishing' | 'ready' | 'error';

export interface PrivacyState {
  p2p: Record<string, { state: P2PLinkState; verified: boolean; detail?: string }>;
  groups: Record<string, { state: GroupState; epoch: number; detail?: string }>;
  watch: Record<string, WatchTogetherPayload | null>;
  serverOffsetMs: number;
  setP2P(channelId: string, state: P2PLinkState, verified?: boolean, detail?: string): void;
  setGroup(channelId: string, state: GroupState, epoch?: number, detail?: string): void;
  setWatch(channelId: string, anchor: WatchTogetherPayload | null): void;
  setServerOffset(ms: number): void;
}

export const usePrivacyStore = create<PrivacyState>((set) => ({
  p2p: {},
  groups: {},
  watch: {},
  serverOffsetMs: 0,
  setP2P: (channelId, state, verified, detail) =>
    set((s) => ({ p2p: { ...s.p2p, [channelId]: { state, verified: verified ?? s.p2p[channelId]?.verified ?? false, detail } } })),
  setGroup: (channelId, state, epoch, detail) =>
    set((s) => ({ groups: { ...s.groups, [channelId]: { state, epoch: epoch ?? s.groups[channelId]?.epoch ?? 0, detail } } })),
  setWatch: (channelId, anchor) => set((s) => ({ watch: { ...s.watch, [channelId]: anchor } })),
  setServerOffset: (serverOffsetMs) => set({ serverOffsetMs }),
}));
