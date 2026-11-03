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
export const JOIN_GREETINGS: readonly string[] = [
  '{name} joined the party.',
  '{name} is here.',
  'Welcome, {name}. We hope you brought pizza.',
  'A wild {name} appeared.',
  '{name} just landed.',
  '{name} just slid into the server.',
  'Everyone welcome {name}!',
  'Glad you are here, {name}.',
  'Good to see you, {name}.',
  'Yay you made it, {name}!',
];

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

export function joinGreeting(messageId: string): string {
  return JOIN_GREETINGS[joinGreetingIndex(messageId)]!;
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
export function callDuration(startIso: string, endIso: string): string {
  const ms = Date.parse(endIso) - Date.parse(startIso);
  if (!Number.isFinite(ms) || ms < 60_000) return 'a few seconds';
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return plural(minutes, 'minute');
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return plural(hours, 'hour');
  return plural(Math.floor(hours / 24), 'day');
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

export function systemSpec(input: SystemInput): SystemSpec {
  const { authorName: author, targetName: target } = input;
  const base = { joinCall: false, wave: false };
  switch (input.type) {
    case 1:
      return { ...base, kind: 'recipientAdd', icon: 'arrowIn', tone: 'positive', parts: [name(author), text(' added '), name(target ?? 'someone'), text(' to the group.')] };
    case 2:
      return {
        ...base,
        kind: 'recipientRemove',
        icon: 'arrowOut',
        tone: 'negative',
        parts: target && target === author ? [name(author), text(' left the group.')] : [name(author), text(' removed '), name(target ?? 'someone'), text(' from the group.')],
      };
    case 3: {
      const ended = input.call?.ended_timestamp;
      return {
        ...base,
        kind: 'call',
        icon: ended ? 'phoneEnded' : 'phone',
        tone: ended ? 'neutral' : 'positive',
        parts: ended ? [name(author), text(` started a call that lasted ${callDuration(input.timestamp, ended)}.`)] : [name(author), text(' started a call.')],
        joinCall: !ended,
      };
    }
    case 4:
      return { ...base, kind: 'nameChange', icon: 'pencil', tone: 'neutral', parts: [name(author), text(' changed the group name'), ...(input.content ? [text(' to '), name(input.content)] : []), text('.')] };
    case 5:
      return { ...base, kind: 'iconChange', icon: 'image', tone: 'neutral', parts: [name(author), text(' changed the group icon.')] };
    case 6:
      return {
        ...base,
        kind: 'pin',
        icon: 'pin',
        tone: 'neutral',
        parts: [
          name(author),
          text(' pinned '),
          input.hasReference ? { t: 'link', text: 'a message', action: 'jump' } : text('a message'),
          text(' to this channel. See all '),
          { t: 'link', text: 'pinned messages', action: 'pins' },
          text('.'),
        ],
      };
    case 7:
      return { ...base, kind: 'join', icon: 'wave', tone: 'positive', parts: greetingParts(joinGreeting(input.messageId), author), wave: true };
    case 18:
      return {
        ...base,
        kind: 'thread',
        icon: 'thread',
        tone: 'neutral',
        parts: [name(author), text(' started a thread: '), { t: 'link', text: input.threadName || input.content || 'thread', action: 'thread' }, text('.')],
      };
    default:
      return { ...base, kind: 'unknown', icon: 'warning', tone: 'neutral', parts: [text(`Unknown system message (type ${input.type})`)] };
  }
}

export interface SystemMenuContext {
  canManageMessages: boolean;
  /** Developer mode. `undefined` means the setting does not exist yet, so Copy ID stays visible as before. */
  developerMode?: boolean;
}

/** Context menu of a system message: Mark Unread, Delete for moderators, Copy ID (Developer mode). */
export function buildSystemMenu(ctx: SystemMenuContext): MenuModel[] {
  const out: MenuModel[] = [item('markUnread', 'Mark Unread')];
  if (ctx.canManageMessages) out.push(sep(), item('delete', 'Delete Message', { danger: true }));
  if (ctx.developerMode !== false) out.push(sep(), item('copyId', 'Copy Message ID'));
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
