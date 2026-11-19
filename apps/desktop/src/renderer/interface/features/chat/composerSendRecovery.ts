import { useAgeRestrictedStore } from '@discordy/core/application/stores/ageRestrictedStore';
import { useDraftStore } from '@discordy/core/application/stores/composerStores';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import type { ChatMessage } from '@discordy/core/application/stores/messageStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import type { Channel, DeliveryMode } from '@discordy/core/contracts/rest';
import { useConnectionStore } from '../../app/connectionStore';

export interface SendDraft {
  text: string;
  files: File[];
  descriptions: ReadonlyMap<File, string>;
  mentions: ReadonlyMap<string, string>;
  replyTo: ChatMessage | null;
  pingReplied: boolean;
}

/** A failed send may outlive its stage, but never its authenticated runtime. */
export interface SendScope {
  epoch: number;
  ownerId: string | null;
  channelId: string;
  channelBinding: string;
  knownChannel: boolean;
  mode: DeliveryMode;
}
export interface SendRecoveryReceiver { empty(): boolean; matchesSaved(draft: SendDraft): boolean; restore(draft: SendDraft): void }
interface Waiting { draft: SendDraft; expires: number; bytes: number }
interface Entry { scope: SendScope; revision: number; inFlight: number; receiver?: SendRecoveryReceiver; waiting?: Waiting; restoring?: boolean }
export interface SendAttempt { scope: SendScope; entry: Entry; revision: number }

const entries = new Map<string, Entry>();
const MAX_WAITING = 8;
const MAX_BYTES = 256 * 1024 * 1024;
const RETAIN_MS = 10 * 60_000;
let epoch = 0;
let expiry: ReturnType<typeof setTimeout> | undefined;
const channelBinding = (channel: Channel) => JSON.stringify([channel.id, channel.guild_id ?? null, channel.type, channel.delivery_mode ?? 'standard']);
const key = (scope: SendScope) => JSON.stringify([scope.epoch, scope.channelId, scope.mode]);

function clear(): void {
  epoch++;
  entries.clear();
  clearTimeout(expiry);
  expiry = undefined;
}

useSessionStore.subscribe((next, previous) => {
  if (next.user?.id !== previous.user?.id || next.sessionId !== previous.sessionId || next.deviceId !== previous.deviceId
    || next.status !== previous.status && (next.status === 'signedOut' || next.status === 'booting')) clear();
});
useConnectionStore.subscribe((next, previous) => { if (next.apiUrl !== previous.apiUrl || next.runtimeVersion !== previous.runtimeVersion) clear(); });
useAgeRestrictedStore.subscribe((next, previous) => { if (next.instance !== previous.instance) clear(); });
useUiStore.subscribe((next, previous) => {
  for (const entry of entries.values()) {
    if (!entry.restoring && next.replyTo[entry.scope.channelId] !== previous.replyTo[entry.scope.channelId]) {
      entry.revision++;
      delete entry.waiting;
    }
  }
});

export function captureSendScope(channel: Channel, mode: DeliveryMode): SendScope {
  return { epoch, ownerId: useSessionStore.getState().user?.id ?? null, channelId: channel.id, channelBinding: channelBinding(channel), knownChannel: Boolean(useGuildStore.getState().channels[channel.id]), mode };
}

export function isSendScopeCurrent(scope: SendScope): boolean {
  const channel = useGuildStore.getState().channels[scope.channelId];
  const session = useSessionStore.getState();
  return scope.epoch === epoch && scope.ownerId !== null && session.user?.id === scope.ownerId
    && session.status !== 'signedOut' && session.status !== 'booting'
    && (!channel ? !scope.knownChannel : channelBinding(channel) === scope.channelBinding);
}

function entryFor(scope: SendScope): Entry {
  const id = key(scope);
  let entry = entries.get(id);
  if (!entry) { entry = { scope, revision: 0, inFlight: 0 }; entries.set(id, entry); }
  return entry;
}

function prune(): void {
  clearTimeout(expiry);
  expiry = undefined;
  let bytes = 0;
  const waiting: Entry[] = [];
  for (const [id, entry] of entries) {
    if (entry.waiting && (entry.waiting.expires <= Date.now() || !isSendScopeCurrent(entry.scope))) delete entry.waiting;
    if (entry.waiting) { waiting.push(entry); bytes += entry.waiting.bytes; }
    else if (!entry.receiver && !entry.inFlight) entries.delete(id);
  }
  waiting.sort((a, b) => a.waiting!.expires - b.waiting!.expires);
  while (waiting.length > MAX_WAITING || bytes > MAX_BYTES) {
    const old = waiting.shift()!;
    bytes -= old.waiting!.bytes;
    delete old.waiting;
    if (!old.receiver && !old.inFlight) entries.delete(key(old.scope));
  }
  if (waiting.length) expiry = setTimeout(prune, Math.max(1, waiting[0]!.waiting!.expires - Date.now()));
}

/** Live fields win over persisted drafts, whose writes intentionally debounce. */
function deliver(entry: Entry): void {
  const waiting = entry.waiting;
  const receiver = entry.receiver;
  if (!waiting || !receiver) return;
  if (!isSendScopeCurrent(entry.scope) || !receiver.empty() && !receiver.matchesSaved(waiting.draft)) { delete entry.waiting; return; }
  entry.restoring = true;
  try { receiver.restore(waiting.draft); }
  finally { entry.restoring = false; }
}

/** A new local edit supersedes an older send, even before the disk draft debounce. */
export function editedAfterSend(scope: SendScope): void {
  const entry = entries.get(key(scope));
  if (!entry) return;
  entry.revision++;
  delete entry.waiting;
  prune();
}

export function receiveFailedSends(scope: SendScope, receiver: SendRecoveryReceiver): () => void {
  if (scope.mode !== 'standard' || !isSendScopeCurrent(scope)) return () => undefined;
  prune();
  const entry = entryFor(scope);
  entry.receiver = receiver;
  deliver(entry);
  return () => { if (entry.receiver === receiver) delete entry.receiver; prune(); };
}

export function beginSend(scope: SendScope): SendAttempt {
  const entry = entryFor(scope);
  delete entry.waiting;
  entry.inFlight++;
  return { scope, entry, revision: ++entry.revision };
}

export function recoverFailedSend(attempt: SendAttempt, draft: SendDraft): void {
  const { entry, scope, revision } = attempt;
  if (scope.mode !== 'standard' || !isSendScopeCurrent(scope) || entry.revision !== revision) return;
  const ui = useUiStore.getState();
  if (ui.replyTo[scope.channelId] || ui.editing?.channelId === scope.channelId) return;
  if (entry.receiver) {
    if (!entry.receiver.empty()) return;
  } else {
    const saved = useDraftStore.getState().drafts[scope.channelId];
    if (saved?.text || saved?.replyTo) return;
  }
  entry.waiting = { draft, expires: Date.now() + RETAIN_MS, bytes: draft.files.reduce((total, file) => total + file.size, 0) };
  deliver(entry);
  prune();
}

export function finishSend(attempt: SendAttempt): void {
  attempt.entry.inFlight--;
  prune();
}
