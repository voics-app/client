import type { SpoilerDisplay } from './prefsTypes';

/** Whether spoilers are shown without a click: always, or on servers where the viewer has MANAGE_MESSAGES. */
export function spoilersOpen(mode: SpoilerDisplay, canManageMessages: boolean): boolean {
  return mode === 'always' || (mode === 'moderated' && canManageMessages);
}

const COMPACT_REPLY_MAX = 80;

/** The quoted text of a reply: on one line and shortened when the compact preview is on. */
export function replyPreviewText(content: string, compact: boolean): string {
  if (!compact) return content;
  const flat = content.replace(/\s+/g, ' ').trim();
  return flat.length > COMPACT_REPLY_MAX ? `${flat.slice(0, COMPACT_REPLY_MAX - 1).trimEnd()}…` : flat;
}
