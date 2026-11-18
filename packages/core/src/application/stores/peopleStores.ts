/** Presence, typing, relationships and read states. */
import { create } from 'zustand';
import type { Activity, PresenceStatus, ReadStateEntry, Relationship } from '../../contracts/rest';
import { maxSnowflake } from '../../domain/snowflake';
import { compareReadStateVersions, isReadStateVersion } from '../../domain/readStateVersion';

export const TYPING_TTL_MS = 10_000;

export interface PresenceEntry {
  status: PresenceStatus;
  activities: Activity[];
}

export interface PresenceState {
  byUser: Record<string, PresenceEntry>;
  set(userId: string, entry: PresenceEntry): void;
  setMany(entries: Record<string, PresenceEntry>): void;
  reset(): void;
}

export const usePresenceStore = create<PresenceState>((set) => ({
  byUser: {},
  set: (userId, entry) => set((s) => ({ byUser: { ...s.byUser, [userId]: entry } })),
  setMany: (entries) => set((s) => ({ byUser: { ...s.byUser, ...entries } })),
  reset: () => set({ byUser: {} }),
}));

export interface TypingState {
  byChannel: Record<string, Record<string, number>>;
  start(channelId: string, userId: string, now?: number): void;
  stop(channelId: string, userId: string): void;
  prune(now?: number): void;
}

export const useTypingStore = create<TypingState>((set) => ({
  byChannel: {},
  start: (channelId, userId, now = Date.now()) =>
    set((s) => ({ byChannel: { ...s.byChannel, [channelId]: { ...(s.byChannel[channelId] ?? {}), [userId]: now + TYPING_TTL_MS } } })),
  stop: (channelId, userId) =>
    set((s) => {
      const { [userId]: _removed, ...rest } = s.byChannel[channelId] ?? {};
      return { byChannel: { ...s.byChannel, [channelId]: rest } };
    }),
  prune: (now = Date.now()) =>
    set((s) => ({
      byChannel: Object.fromEntries(
        Object.entries(s.byChannel).map(([c, users]) => [c, Object.fromEntries(Object.entries(users).filter(([, exp]) => exp > now))]),
      ),
    })),
}));

export function typingUsers(byChannel: TypingState['byChannel'], channelId: string, exclude: string | null, now = Date.now()): string[] {
  return Object.entries(byChannel[channelId] ?? {})
    .filter(([id, exp]) => exp > now && id !== exclude)
    .map(([id]) => id);
}

export interface RelationshipState {
  byUser: Record<string, Relationship>;
  hydrate(list: Relationship[]): void;
  upsert(rel: Relationship): void;
  remove(userId: string): void;
}

export const useRelationshipStore = create<RelationshipState>((set) => ({
  byUser: {},
  hydrate: (list) => set({ byUser: Object.fromEntries(list.map((r) => [r.id, r])) }),
  upsert: (rel) => set((s) => ({ byUser: { ...s.byUser, [rel.id]: rel } })),
  remove: (userId) =>
    set((s) => {
      const { [userId]: _removed, ...rest } = s.byUser;
      return { byUser: rest };
    }),
}));

export interface ReadState {
  lastReadId: string | null;
  mentionCount: number;
}

export interface ReadStateState {
  byChannel: Record<string, ReadState>;
  versioned: boolean;
  snapshots: Record<string, ReadState & { version: string }>;
  hydrate(entries: ReadStateEntry[], options?: { versioned: boolean }): void;
  applySnapshot(entry: ReadStateEntry): void;
  syncSnapshots(entries: ReadStateEntry[]): void;
  markRead(channelId: string, messageId: string): void;
  /** Sets the marker to exactly this message, even backwards (Mark Unread, MESSAGE_ACK from the server). */
  setPosition(channelId: string, messageId: string, mentionCount?: number): void;
  /** Moves the read marker unconditionally (mark unread from a message). */
  setLastRead(channelId: string, messageId: string | null): void;
  addMention(channelId: string): void;
  reset(): void;
}

function validSnapshot(entry: ReadStateEntry): boolean {
  return isReadStateVersion(entry.read_state_version) && typeof entry.id === 'string' && /^[0-9]{1,20}$/.test(entry.id) &&
    (entry.last_message_id === null || (typeof entry.last_message_id === 'string' && /^[0-9]{1,20}$/.test(entry.last_message_id))) &&
    Number.isInteger(entry.mention_count) && entry.mention_count >= 0 && entry.mention_count <= 0xffffffff;
}

function snapshotState(entry: ReadStateEntry): ReadState & { version: string } {
  return { lastReadId: entry.last_message_id, mentionCount: entry.mention_count, version: entry.read_state_version! };
}

function mergeSnapshots(state: ReadStateState, entries: ReadStateEntry[]): Partial<ReadStateState> {
  if (!state.versioned) return {};
  const snapshots = { ...state.snapshots };
  const byChannel = { ...state.byChannel };
  for (const entry of entries) {
    if (!validSnapshot(entry)) continue;
    const next = snapshotState(entry);
    const previous = snapshots[entry.id];
    if (previous && compareReadStateVersions(next.version, previous.version) <= 0) continue;
    snapshots[entry.id] = next;
    byChannel[entry.id] = { lastReadId: next.lastReadId, mentionCount: next.mentionCount };
  }
  return { snapshots, byChannel };
}

export const useReadStateStore = create<ReadStateState>((set) => ({
  byChannel: {},
  versioned: false,
  snapshots: {},
  hydrate: (entries, options) => {
    const versioned = options?.versioned === true;
    if (versioned && (!entries.every(validSnapshot) || new Set(entries.map((entry) => entry.id)).size !== entries.length)) return;
    set({
      versioned,
      snapshots: versioned ? Object.fromEntries(entries.map((entry) => [entry.id, snapshotState(entry)])) : {},
      byChannel: Object.fromEntries(entries.map((e) => [e.id, { lastReadId: e.last_message_id, mentionCount: e.mention_count }])),
    });
  },
  applySnapshot: (entry) => set((state) => mergeSnapshots(state, [entry])),
  syncSnapshots: (entries) => set((state) => {
    if (!state.versioned) return {};
    const merged = { ...state, ...mergeSnapshots(state, entries) };
    const byChannel = { ...merged.byChannel };
    for (const entry of entries) {
      const snapshot = merged.snapshots[entry.id];
      // Reconcile a local optimistic write that never committed. Never accept a
      // conflicting equal-version payload or an older snapshot over replay.
      if (validSnapshot(entry) && snapshot && snapshot.version === entry.read_state_version &&
          snapshot.lastReadId === entry.last_message_id && snapshot.mentionCount === entry.mention_count) {
        byChannel[entry.id] = { lastReadId: snapshot.lastReadId, mentionCount: snapshot.mentionCount };
      }
    }
    return { snapshots: merged.snapshots, byChannel };
  }),
  markRead: (channelId, messageId) =>
    set((s) => ({
      byChannel: { ...s.byChannel, [channelId]: { lastReadId: maxSnowflake(s.byChannel[channelId]?.lastReadId, messageId), mentionCount: 0 } },
    })),
  setPosition: (channelId, messageId, mentionCount = 0) =>
    set((s) => ({ byChannel: { ...s.byChannel, [channelId]: { lastReadId: messageId, mentionCount } } })),
  setLastRead: (channelId, messageId) =>
    set((s) => ({ byChannel: { ...s.byChannel, [channelId]: { lastReadId: messageId, mentionCount: s.byChannel[channelId]?.mentionCount ?? 0 } } })),
  addMention: (channelId) =>
    set((s) => {
      const current = s.byChannel[channelId] ?? { lastReadId: null, mentionCount: 0 };
      return { byChannel: { ...s.byChannel, [channelId]: { ...current, mentionCount: current.mentionCount + 1 } } };
    }),
  reset: () => set({ byChannel: {}, snapshots: {}, versioned: false }),
}));
