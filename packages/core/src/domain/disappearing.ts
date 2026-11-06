/** Disappearing messages in the private delivery modes: the timer choices and the limits a peer-supplied timer must respect. */

export interface DisappearOption {
  /** Milliseconds; null turns the timer off. */
  ttlMs: number | null;
  label: string;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const DISAPPEAR_OPTIONS: readonly DisappearOption[] = [
  { ttlMs: null, label: 'Off' },
  { ttlMs: 5 * MINUTE, label: '5 minutes' },
  { ttlMs: HOUR, label: '1 hour' },
  { ttlMs: DAY, label: '1 day' },
  { ttlMs: 7 * DAY, label: '1 week' },
  { ttlMs: 28 * DAY, label: '4 weeks' },
];

export const MIN_TTL_MS = 5_000;
export const MAX_TTL_MS = 28 * DAY;

/** A timer value received from a peer, or null when it is missing, not a number or outside the allowed range. */
export function parseTtl(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= MIN_TTL_MS && value <= MAX_TTL_MS ? Math.floor(value) : null;
}

export function ttlLabel(ttlMs: number | null | undefined): string {
  if (!ttlMs) return 'Off';
  return DISAPPEAR_OPTIONS.find((o) => o.ttlMs === ttlMs)?.label ?? `${Math.round(ttlMs / MINUTE)} minutes`;
}

/**
 * What the app may honestly say about deleting a private message. Deleting removes it from every
 * participating device that is online or catches up, but cannot reach a copy someone already made.
 */
export const DELETE_PRIVATE_NOTE =
  'This removes the message from your devices and asks the other devices in this chat to remove it too. Anyone who already copied it or took a screenshot still has it.';

export const DISAPPEAR_NOTE =
  'New messages are removed from every device in this chat after this time. It cannot stop someone from copying or screenshotting a message before then.';
