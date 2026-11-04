/** Pure rules for the signed-in user's own presence: automatic idle, custom status expiry and the gateway payload. */
import type { Activity, CustomStatus, PresenceStatus } from '../contracts/rest';

export type ManualStatus = Exclude<PresenceStatus, 'offline'>;

export const CUSTOM_STATUS_ACTIVITY_TYPE = 4;

export type ExpiryChoice = 'never' | '30m' | '1h' | '4h' | 'today';

export const EXPIRY_CHOICES: readonly { id: ExpiryChoice; label: string }[] = [
  { id: 'never', label: "Don't clear" },
  { id: '30m', label: '30 minutes' },
  { id: '1h', label: '1 hour' },
  { id: '4h', label: '4 hours' },
  { id: 'today', label: 'Today' },
];

/** ISO time a custom status should expire for a choice, or null to keep it until cleared. "Today" is local midnight. */
export function expiryFor(choice: ExpiryChoice, now: Date): string | null {
  switch (choice) {
    case 'never':
      return null;
    case '30m':
      return new Date(now.getTime() + 30 * 60_000).toISOString();
    case '1h':
      return new Date(now.getTime() + 60 * 60_000).toISOString();
    case '4h':
      return new Date(now.getTime() + 4 * 60 * 60_000).toISOString();
    case 'today':
      return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
  }
}

/** Longest custom status text the gateway accepts. */
export const CUSTOM_STATUS_MAX = 128;

/** Trims the text and caps it at 128 characters (by code point, so an emoji is never cut in half). */
export function clampStatusText(text: string): string {
  return [...text.trim()].slice(0, CUSTOM_STATUS_MAX).join('');
}

/** Characters left in the editor. */
export function statusCharsLeft(text: string): number {
  return CUSTOM_STATUS_MAX - [...text].length;
}

export function isExpired(status: CustomStatus | null | undefined, nowMs: number): boolean {
  if (!status?.expires_at) return false;
  const at = Date.parse(status.expires_at);
  return Number.isFinite(at) && at <= nowMs;
}

/** The custom status that still applies, or null when unset, empty or expired. */
export function activeCustomStatus(status: CustomStatus | null | undefined, nowMs: number): CustomStatus | null {
  if (!(status?.text || status?.emoji_name) || isExpired(status, nowMs)) return null;
  return status;
}

/** Custom status as a Discord-style type 4 activity, so everyone else's member list can show it. */
export function customStatusActivities(status: CustomStatus | null | undefined, nowMs: number): Activity[] {
  const active = activeCustomStatus(status, nowMs);
  if (!active) return [];
  const emoji = active.emoji_name ? (active.emoji_id ? { name: active.emoji_name, id: active.emoji_id } : { name: active.emoji_name }) : null;
  return [{ name: 'Custom Status', type: CUSTOM_STATUS_ACTIVITY_TYPE, state: active.text || null, emoji }];
}

/** Idle only ever replaces Online: a deliberate Idle, Do Not Disturb or Invisible is never overridden. */
export function effectiveStatus(manual: ManualStatus | undefined, autoIdle: boolean): ManualStatus {
  const status = manual ?? 'online';
  return status === 'online' && autoIdle ? 'idle' : status;
}

export interface IdleSample {
  idleSeconds: number;
  locked: boolean;
  timeoutMinutes: number;
  manual: ManualStatus | undefined;
}

/** Whether the automatic idle flag should be set now. Locking the screen goes idle at once; any input clears it. */
export function nextAutoIdle(sample: IdleSample): boolean {
  if ((sample.manual ?? 'online') !== 'online') return false;
  if (sample.locked) return true;
  if (sample.timeoutMinutes <= 0) return false;
  return sample.idleSeconds >= sample.timeoutMinutes * 60;
}

export interface SelfPresencePayload {
  status: ManualStatus;
  activities: Activity[];
  afk: boolean;
}

export function selfPresencePayload(manual: ManualStatus | undefined, custom: CustomStatus | null | undefined, autoIdle: boolean, nowMs: number): SelfPresencePayload {
  const status = effectiveStatus(manual, autoIdle);
  return { status, activities: customStatusActivities(custom, nowMs), afk: status === 'idle' && autoIdle };
}
