import { createI18n, type MessageId, type MessageValues } from './i18n';
import { en } from './locales/en';
import { item, sep, tidy, type MenuModel } from './menuModel';

/** Renderer table for server-generated messages (Discord message types 1-7, 18). Pure: no React, no stores. */

export type SystemKind = 'recipientAdd' | 'recipientRemove' | 'call' | 'nameChange' | 'iconChange' | 'pin' | 'join' | 'thread' | 'unknown';
export type SystemIcon = 'arrowIn' | 'arrowOut' | 'phone' | 'phoneEnded' | 'pencil' | 'image' | 'pin' | 'wave' | 'thread' | 'warning';
export type SystemTone = 'positive' | 'negative' | 'neutral';
/** What a link inside the text does. */
export type SystemLinkAction = 'pins' | 'thread' | 'jump';

export type SystemPart =
  | { t: 'text'; text: string }
  | { t: 'name'; text: string }
  | { t: 'link'; text: string; action: SystemLinkAction };

export interface SystemInput {
  type: number;
  messageId: string;
  authorName: string;
  /** First mentioned user (group DM add/remove). */
  targetName: string | null;
  content: string;
  timestamp: string;
  /** Type 3 payload. */
  call?: { ended_timestamp?: string | null } | null;
  /** Type 18: the created thread. */
  threadName?: string | null;
  /** Pin messages carry the pinned message as a reference. */
  hasReference?: boolean;
}

export interface SystemSpec {
  kind: SystemKind;
  icon: SystemIcon;
  tone: SystemTone;
  parts: SystemPart[];
  /** Type 3 while the call has no end time: shows Join call. */
  joinCall: boolean;
  /** Type 7: shows the Wave button. */
  wave: boolean;
}

/** Greetings for join messages. `{name}` is replaced by the bold member name. Edit here to add more. */
const JOIN_GREETING_IDS = ['system.join0', 'system.join1', 'system.join2', 'system.join3', 'system.join4', 'system.join5', 'system.join6', 'system.join7', 'system.join8', 'system.join9'] as const;
export const JOIN_GREETINGS: readonly string[] = JOIN_GREETING_IDS.map((id) => en[id]);

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (Math.imul(h, 31) + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Deterministic pick from the message id, so every client and every render shows the same line. */
export function joinGreetingIndex(messageId: string, count = JOIN_GREETINGS.length): number {
  if (count <= 0) return 0;
  if (/^\d+$/.test(messageId)) return Number(BigInt(messageId) % BigInt(count));
  return hashString(messageId) % count;
}

export function joinGreeting(messageId: string, locale?: string): string {
  return createI18n(locale).t(JOIN_GREETING_IDS[joinGreetingIndex(messageId)]!, { name: "{name}" });
}

function greetingParts(template: string, name: string): SystemPart[] {
  const parts: SystemPart[] = [];
  template.split('{name}').forEach((chunk, i, all) => {
    if (chunk) parts.push({ t: 'text', text: chunk });
    if (i < all.length - 1) parts.push({ t: 'name', text: name });
  });
  return parts;
}

/** "a few seconds", "3 minutes", "2 hours", "1 day" for the length of a call. */
export function callDuration(startIso: string, endIso: string, locale?: string): string {
  const { t } = createI18n(locale);
  const ms = Date.parse(endIso) - Date.parse(startIso);
  if (!Number.isFinite(ms) || ms < 60_000) return t('system.fewSeconds');
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return t('common.minutes', { count: minutes });
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? t('common.hours', { count: hours }) : t('common.days', { count: Math.floor(hours / 24) });
}

/** Types this table knows. Anything else gets the fallback text. */
export const KNOWN_SYSTEM_TYPES: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 18];

/**
 * Message types that carry ordinary user or bot content and render as a normal message row: default (0),
 * thread starter (21), reply (19), chat input command (20) and context menu command (23).
 */
export const CONTENT_TYPES: readonly number[] = [0, 19, 20, 21, 23];

/** True for every other type: those render as a system row (unknown ones with the safe fallback). */
export function isSystemType(type: number): boolean {
  return !CONTENT_TYPES.includes(type);
}

const text = (s: string): SystemPart => ({ t: 'text', text: s });
const name = (s: string): SystemPart => ({ t: 'name', text: s });

/** Full ICU sentences control ordering; authored names and links remain typed slots, never parsed as markup. */
export function systemSpec(input: SystemInput, locale?: string): SystemSpec {
  const { t } = createI18n(locale);
  const { authorName: author, targetName: target } = input;
  const base = { joinCall: false, wave: false };
  const parts = (id: MessageId, slots: Record<string, SystemPart>, values: MessageValues = {}): SystemPart[] => {
    const markers = Object.fromEntries(Object.keys(slots).map((key) => [key, '\uFFFC' + key + '\uFFFC']));
    const formatted = t(id, { ...values, ...markers });
    return formatted.split(/(\uFFFC[a-z]+\uFFFC)/).filter(Boolean).map((chunk) => slots[chunk.slice(1, -1)] && chunk.startsWith('\uFFFC') ? slots[chunk.slice(1, -1)]! : text(chunk));
  };
  const actors = { author: name(author), target: name(target ?? t('system.someone')) };
  switch (input.type) {
    case 1:
      return { ...base, kind: 'recipientAdd', icon: 'arrowIn', tone: 'positive', parts: parts('system.added', actors) };
    case 2:
      return { ...base, kind: 'recipientRemove', icon: 'arrowOut', tone: 'negative', parts: parts(target && target === author ? 'system.left' : 'system.removed', actors) };
    case 3: {
      const ended = input.call?.ended_timestamp;
      return { ...base, kind: 'call', icon: ended ? 'phoneEnded' : 'phone', tone: ended ? 'neutral' : 'positive', parts: parts(ended ? 'system.endedCall' : 'system.startedCall', actors, ended ? { duration: callDuration(input.timestamp, ended, locale) } : {}), joinCall: !ended };
    }
    case 4:
      return { ...base, kind: 'nameChange', icon: 'pencil', tone: 'neutral', parts: parts(input.content ? 'system.renamedGroupTo' : 'system.renamedGroup', { ...actors, group: name(input.content) }) };
    case 5:
      return { ...base, kind: 'iconChange', icon: 'image', tone: 'neutral', parts: parts('system.changedIcon', actors) };
    case 6:
      return { ...base, kind: 'pin', icon: 'pin', tone: 'neutral', parts: parts('system.pinned', { ...actors, message: input.hasReference ? { t: 'link', text: t('system.aMessage'), action: 'jump' } : text(t('system.aMessage')), pins: { t: 'link', text: t('system.pins'), action: 'pins' } }) };
    case 7:
      return { ...base, kind: 'join', icon: 'wave', tone: 'positive', parts: greetingParts(joinGreeting(input.messageId, locale), author), wave: true };
    case 18:
      return { ...base, kind: 'thread', icon: 'thread', tone: 'neutral', parts: parts('system.startedThread', { ...actors, thread: { t: 'link', text: input.threadName || input.content || t('system.thread'), action: 'thread' } }) };
    default:
      return { ...base, kind: 'unknown', icon: 'warning', tone: 'neutral', parts: [text(t('system.unknown', { type: input.type }))] };
  }
}

export interface SystemMenuContext {
  canManageMessages: boolean;
  /** Developer mode: Copy ID is shown only when on. */
  developerMode?: boolean;
}

/** Context menu of a system message: Mark Unread, Delete for moderators, Copy ID (Developer mode). */
export function buildSystemMenu(ctx: SystemMenuContext): MenuModel[] {
  const out: MenuModel[] = [item('markUnread', 'Mark Unread')];
  if (ctx.canManageMessages) out.push(sep(), item('delete', 'Delete Message', { danger: true }));
  if (ctx.developerMode) out.push(sep(), item('copyId', 'Copy Message ID'));
  return tidy(out);
}

export type SystemToolbarAction = { id: 'react' | 'delete' | 'more'; label: string; arg?: string };

/** Hover toolbar: a quick reaction for people who may react, Delete for moderators, and More. */
export function buildSystemToolbar(ctx: { canReact: boolean; canManageMessages: boolean; reaction: string }): SystemToolbarAction[] {
  const out: SystemToolbarAction[] = [];
  if (ctx.canReact) out.push({ id: 'react', label: 'Add reaction', arg: ctx.reaction });
  if (ctx.canManageMessages) out.push({ id: 'delete', label: 'Delete' });
  out.push({ id: 'more', label: 'More' });
  return out;
}
