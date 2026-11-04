/** Per-visit unread anchors (the "New" divider) and pending jump-to-message requests. */
import { create } from 'zustand';

export interface JumpRequest {
  id: number;
  channelId: string;
  messageId: string;
  /** `message`: scroll to this message. `firstAfter`: scroll to the first unread message after this marker. */
  mode: 'message' | 'firstAfter';
}

export interface ReadNavState {
  /** Read marker captured when the channel was opened; the divider and bar are derived from it. */
  anchors: Record<string, string | null>;
  /** Bar dismissed by "Mark as read" for this visit. */
  barDismissed: Record<string, boolean>;
  jump: JumpRequest | null;
  captureAnchor(channelId: string, lastReadId: string | null): void;
  setAnchor(channelId: string, lastReadId: string | null): void;
  releaseAnchor(channelId: string): void;
  dismissBar(channelId: string): void;
  requestJump(channelId: string, messageId: string, mode?: JumpRequest['mode']): void;
  consumeJump(id: number): void;
}

let jumpSeq = 1;

export const useReadNavStore = create<ReadNavState>((set, get) => ({
  anchors: {},
  barDismissed: {},
  jump: null,
  captureAnchor: (channelId, lastReadId) => {
    if (channelId in get().anchors) return;
    set((s) => ({ anchors: { ...s.anchors, [channelId]: lastReadId }, barDismissed: { ...s.barDismissed, [channelId]: false } }));
  },
  setAnchor: (channelId, lastReadId) => set((s) => ({ anchors: { ...s.anchors, [channelId]: lastReadId }, barDismissed: { ...s.barDismissed, [channelId]: false } })),
  releaseAnchor: (channelId) =>
    set((s) => {
      const { [channelId]: _a, ...anchors } = s.anchors;
      const { [channelId]: _d, ...barDismissed } = s.barDismissed;
      return { anchors, barDismissed };
    }),
  dismissBar: (channelId) => set((s) => ({ barDismissed: { ...s.barDismissed, [channelId]: true } })),
  requestJump: (channelId, messageId, mode = 'message') => set({ jump: { id: jumpSeq++, channelId, messageId, mode } }),
  consumeJump: (id) => {
    if (get().jump?.id === id) set({ jump: null });
  },
}));
