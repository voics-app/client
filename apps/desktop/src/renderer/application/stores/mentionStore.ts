/** A mention chosen from a context menu, waiting for the open composer of that channel to insert it. */
import { create } from "zustand";

export interface MentionRequest {
  id: number;
  channelId: string;
  token: string;
  wire: string;
}

interface MentionState {
  request: MentionRequest | null;
  requestMention(channelId: string, name: string, userId: string): void;
  consume(id: number): void;
}

let nextId = 1;

export const useMentionStore = create<MentionState>((set, get) => ({
  request: null,
  requestMention: (channelId, name, userId) =>
    set({
      request: {
        id: nextId++,
        channelId,
        token: `@${name}`,
        wire: `<@${userId}>`,
      },
    }),
  consume: (id) => {
    if (get().request?.id === id) set({ request: null });
  },
}));
