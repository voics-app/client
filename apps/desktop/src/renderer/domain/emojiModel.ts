import type { Emoji } from '@shared/contracts/rest';

export interface EmojiCategory {
  id: string;
  label: string;
  /** Glyph shown in the category bar. */
  icon: string;
  emoji: string[];
}

export const EMOJI_CATEGORIES: EmojiCategory[] = [
  { id: 'smileys', label: 'Smileys', icon: '😀', emoji: ['😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '🙂', '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😋', '😛', '🤪', '🤔', '🤨', '😐', '😑', '🙄', '😏', '😴', '😮', '😢', '😭', '😤', '😡', '🥳', '😎', '🤯', '😳', '🥺', '😱', '🤗', '🫡', '🫠'] },
  { id: 'gestures', label: 'Gestures', icon: '👍', emoji: ['👍', '👎', '👏', '🙌', '🙏', '🤝', '👋', '✌️', '🤞', '🤟', '🤙', '💪', '👀', '🫶', '🖖', '👌'] },
  { id: 'hearts', label: 'Hearts and symbols', icon: '❤️', emoji: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '💔', '💖', '💯', '✨', '🔥', '⭐', '🎉', '🎊'] },
  { id: 'things', label: 'Things and animals', icon: '🎮', emoji: ['🎮', '🎧', '🎵', '🍕', '🍔', '☕', '🍺', '🚀', '💡', '📌', '📎', '🔒', '🔑', '⚡', '🌙', '☀️', '🌈', '🐱', '🐶', '🦊'] },
];

/** Skin tone modifiers; the first entry is the default (none). */
export const SKIN_TONES = ['', '\u{1F3FB}', '\u{1F3FC}', '\u{1F3FD}', '\u{1F3FE}', '\u{1F3FF}'] as const;
export type SkinTone = (typeof SKIN_TONES)[number];

const TONE_CAPABLE = new Set(['👍', '👎', '👏', '🙌', '🙏', '🤝', '👋', '✌️', '🤞', '🤟', '🤙', '💪', '🫶', '🖖', '👌']);

export const supportsSkinTone = (emoji: string): boolean => TONE_CAPABLE.has(emoji);

/** The emoji with the tone modifier inserted after its base character; other emoji are returned unchanged. */
export function applySkinTone(emoji: string, tone: string): string {
  if (!tone || !TONE_CAPABLE.has(emoji)) return emoji;
  const [base] = Array.from(emoji);
  return `${base}${tone}`;
}

export interface GuildEmojiGroup {
  guildId: string;
  guildName: string;
  emoji: (Emoji & { id: string; name: string })[];
}

interface GuildLike {
  id: string;
  name: string;
  emojis?: Emoji[];
}

/**
 * Custom emoji the viewer can use, grouped per server (current server first). Emoji of other servers
 * need USE_EXTERNAL_EMOJIS in the current channel; without it only the current server's are offered.
 */
export function usableEmojiGroups(guilds: GuildLike[], currentGuildId: string | null | undefined, canUseExternal: boolean, query = ''): GuildEmojiGroup[] {
  const q = query.trim().toLowerCase();
  const groups: GuildEmojiGroup[] = [];
  for (const g of guilds) {
    if (g.id !== currentGuildId && !canUseExternal) continue;
    const emoji = (g.emojis ?? []).filter((e): e is Emoji & { id: string; name: string } => Boolean(e.id && e.name) && e.available !== false && (!q || e.name!.toLowerCase().includes(q)));
    if (emoji.length > 0) groups.push({ guildId: g.id, guildName: g.name, emoji });
  }
  return groups.sort((a, b) => Number(b.guildId === currentGuildId) - Number(a.guildId === currentGuildId));
}

/** Tooltip text of a reaction chip: names, then "and N others" once the list is longer than the shown names. */
export function reactionSummary(names: string[], count: number, emojiLabel: string): string {
  if (names.length === 0) return `Reacted with ${emojiLabel}`;
  const rest = Math.max(0, count - names.length);
  const shown = names.slice(0, 3);
  const extra = rest + names.length - shown.length;
  const who = extra > 0 ? `${shown.join(', ')} and ${extra} other${extra === 1 ? '' : 's'}` : shown.length > 1 ? `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}` : shown[0]!;
  return `${who} reacted with ${emojiLabel}`;
}
