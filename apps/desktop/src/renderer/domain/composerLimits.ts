export const MAX_MESSAGE_LENGTH = 2000;
export const COUNTER_THRESHOLD = 200;
export const MAX_FILES = 10;

/** Characters left before the limit; negative when over. */
export function charsRemaining(text: string, max = MAX_MESSAGE_LENGTH): number {
  return max - [...text.trim()].length;
}

/** The counter appears only when the user is close to (or over) the limit. */
export function showCounter(remaining: number): boolean {
  return remaining <= COUNTER_THRESHOLD;
}

/** Seconds left of a channel's slowmode; 0 when sending is allowed. */
export function slowmodeRemaining(rateLimitPerUser: number | undefined, lastSentAt: number | undefined, nowMs: number): number {
  if (!rateLimitPerUser || !lastSentAt) return 0;
  return Math.max(0, Math.ceil((lastSentAt + rateLimitPerUser * 1000 - nowMs) / 1000));
}

export function formatCountdown(seconds: number): string {
  if (seconds >= 3600) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  if (seconds >= 60) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${seconds}s`;
}

export interface FileLimitResult {
  accepted: File[];
  /** Human readable reasons, empty when everything fit. */
  problems: string[];
}

/** Applies the per-message file count and per-file size limits to dropped or pasted files. */
export function acceptFiles(existing: readonly File[], incoming: readonly File[], maxBytes: number, allowEmpty: boolean, maxFiles = MAX_FILES): FileLimitResult {
  const problems: string[] = [];
  const sized = incoming.filter((f) => f.size <= maxBytes && (allowEmpty || f.size > 0));
  const rejected = incoming.length - sized.length;
  if (rejected > 0) problems.push(`${rejected === 1 ? 'A file is' : `${rejected} files are`} empty or larger than ${Math.round(maxBytes / 1048576)} MB.`);
  const room = Math.max(0, maxFiles - existing.length);
  if (sized.length > room) problems.push(`You can attach at most ${maxFiles} files to a message.`);
  return { accepted: sized.slice(0, room), problems };
}

/** Pasted text longer than a message is attached as a file instead, as Discord does. */
export function shouldPasteAsFile(pasted: string, max = MAX_MESSAGE_LENGTH): boolean {
  return [...pasted].length > max;
}

interface EditableCandidate {
  id: string;
  type: number;
  author: { id: string };
  localState?: 'sending' | 'failed';
}

/** Most recent message the user may edit with ArrowUp: their own, delivered, ordinary text (default or reply). */
export function lastOwnEditable<T extends EditableCandidate>(messagesOldestFirst: readonly T[], me: string | null): T | null {
  if (!me) return null;
  for (let i = messagesOldestFirst.length - 1; i >= 0; i--) {
    const m = messagesOldestFirst[i]!;
    if (m.author.id === me && !m.localState && (m.type === 0 || m.type === 19)) return m;
  }
  return null;
}
