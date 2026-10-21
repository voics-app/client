/** Per-channel message timelines with optimistic sends resolved by nonce. */
import { create } from 'zustand';
import type { DeliveryMode, Emoji, Message } from '@shared/contracts/rest';
import { compareSnowflakes } from '@renderer/domain/snowflake';

export type LocalState = 'sending' | 'failed';

export interface ChatMessage extends Message {
  localState?: LocalState;
  /** Delivery mode the message travelled over; private modes never touch server history. */
  deliveryMode?: DeliveryMode;
  error?: string;
}

export interface Timeline {
  ids: string[];
  byId: Record<string, ChatMessage>;
  hasMoreBefore: boolean;
  loaded: boolean;
  /** A window around an old message (search jump): newer messages are not appended until the latest is reloaded. */
  detached?: boolean;
}

export interface MessageState {
  timelines: Record<string, Timeline>;
  setHistory(channelId: string, messages: ChatMessage[], options: { prepend: boolean; hasMoreBefore: boolean }): void;
  /** Replaces the timeline with a window that does not reach the present. */
  setWindow(channelId: string, messages: ChatMessage[], options: { hasMoreBefore: boolean }): void;
  receive(message: ChatMessage): void;
  addOptimistic(message: ChatMessage): void;
  failOptimistic(channelId: string, nonce: string, error: string): void;
  patch(channelId: string, messageId: string, patch: Partial<ChatMessage>): void;
  remove(channelId: string, messageId: string): void;
  removeMany(channelId: string, messageIds: string[]): void;
  reactionAdd(channelId: string, messageId: string, emoji: Emoji, isMe: boolean): void;
  reactionRemove(channelId: string, messageId: string, emoji: Emoji, isMe: boolean): void;
  reactionClear(channelId: string, messageId: string): void;
  reset(): void;
}

const emptyTimeline = (): Timeline => ({ ids: [], byId: {}, hasMoreBefore: true, loaded: false });
const emojiKey = (e: Emoji) => (e.id ? `${e.name}:${e.id}` : (e.name ?? ''));

function sortIds(ids: string[], byId: Record<string, ChatMessage>): string[] {
  return [...new Set(ids)].sort((a, b) => {
    const x = byId[a];
    const y = byId[b];
    if (x?.localState && !y?.localState) return 1;
    if (y?.localState && !x?.localState) return -1;
    return x?.localState && y?.localState ? x.timestamp.localeCompare(y.timestamp) : compareSnowflakes(a, b);
  });
}

function updateTimeline(state: MessageState, channelId: string, fn: (t: Timeline) => Timeline): Pick<MessageState, 'timelines'> {
  return { timelines: { ...state.timelines, [channelId]: fn(state.timelines[channelId] ?? emptyTimeline()) } };
}

function mapMessage(t: Timeline, id: string, fn: (m: ChatMessage) => ChatMessage): Timeline {
  const m = t.byId[id];
  return m ? { ...t, byId: { ...t.byId, [id]: fn(m) } } : t;
}

export const useMessageStore = create<MessageState>((set) => ({
  timelines: {},
  setHistory: (channelId, messages, { prepend, hasMoreBefore }) =>
    set((s) =>
      updateTimeline(s, channelId, (t) => {
        const byId = { ...(prepend ? t.byId : Object.fromEntries(Object.entries(t.byId).filter(([, m]) => m.localState))) };
        for (const m of messages) byId[m.id] = m;
        const base = prepend ? t.ids : t.ids.filter((id) => byId[id]?.localState);
        return { ids: sortIds([...base, ...messages.map((m) => m.id)], byId), byId, hasMoreBefore, loaded: true, detached: prepend ? t.detached : false };
      }),
    ),
  setWindow: (channelId, messages, { hasMoreBefore }) =>
    set((s) =>
      updateTimeline(s, channelId, () => {
        const byId = Object.fromEntries(messages.map((m) => [m.id, m]));
        return { ids: sortIds(messages.map((m) => m.id), byId), byId, hasMoreBefore, loaded: true, detached: true };
      }),
    ),
  receive: (message) =>
    set((s) =>
      updateTimeline(s, message.channel_id, (t) => {
        // A detached window shows old history; the live message appears once the latest is reloaded.
        if (t.detached && !t.byId[message.id]) return t;
        const byId = { ...t.byId };
        let ids = t.ids;
        const nonce = message.nonce != null ? String(message.nonce) : null;
        if (nonce && byId[nonce]?.localState) {
          delete byId[nonce];
          ids = ids.filter((id) => id !== nonce);
        }
        byId[message.id] = { ...byId[message.id], ...message, localState: undefined };
        return { ...t, byId, ids: sortIds([...ids, message.id], byId) };
      }),
    ),
  addOptimistic: (message) =>
    set((s) =>
      updateTimeline(s, message.channel_id, (t) => {
        const byId = { ...t.byId, [message.id]: { ...message, localState: 'sending' as const } };
        return { ...t, byId, ids: sortIds([...t.ids, message.id], byId) };
      }),
    ),
  failOptimistic: (channelId, nonce, error) =>
    set((s) => updateTimeline(s, channelId, (t) => mapMessage(t, nonce, (m) => ({ ...m, localState: 'failed', error })))),
  patch: (channelId, messageId, patch) =>
    set((s) => updateTimeline(s, channelId, (t) => mapMessage(t, messageId, (m) => ({ ...m, ...patch })))),
  remove: (channelId, messageId) =>
    set((s) =>
      updateTimeline(s, channelId, (t) => {
        const { [messageId]: _removed, ...byId } = t.byId;
        return { ...t, byId, ids: t.ids.filter((id) => id !== messageId) };
      }),
    ),
  removeMany: (channelId, messageIds) =>
    set((s) =>
      updateTimeline(s, channelId, (t) => {
        const drop = new Set(messageIds);
        return {
          ...t,
          byId: Object.fromEntries(Object.entries(t.byId).filter(([id]) => !drop.has(id))),
          ids: t.ids.filter((id) => !drop.has(id)),
        };
      }),
    ),
  reactionAdd: (channelId, messageId, emoji, isMe) =>
    set((s) =>
      updateTimeline(s, channelId, (t) =>
        mapMessage(t, messageId, (m) => {
          const reactions = [...(m.reactions ?? [])];
          const i = reactions.findIndex((r) => emojiKey(r.emoji) === emojiKey(emoji));
          if (i >= 0) {
            const r = reactions[i]!;
            if (isMe && r.me) return m;
            reactions[i] = { ...r, count: r.count + 1, me: r.me || isMe };
          } else reactions.push({ emoji, count: 1, me: isMe });
          return { ...m, reactions };
        }),
      ),
    ),
  reactionRemove: (channelId, messageId, emoji, isMe) =>
    set((s) =>
      updateTimeline(s, channelId, (t) =>
        mapMessage(t, messageId, (m) => ({
          ...m,
          reactions: (m.reactions ?? [])
            .map((r) => (emojiKey(r.emoji) === emojiKey(emoji) && (!isMe || r.me) ? { ...r, count: r.count - 1, me: isMe ? false : r.me } : r))
            .filter((r) => r.count > 0),
        })),
      ),
    ),
  reactionClear: (channelId, messageId) =>
    set((s) => updateTimeline(s, channelId, (t) => mapMessage(t, messageId, (m) => ({ ...m, reactions: [] })))),
  reset: () => set({ timelines: {} }),
}));

export const reactionKey = emojiKey;
