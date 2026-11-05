import type { Emoji } from '@discordy/core/contracts/rest';
import { EMOJI_CATEGORIES, usableEmojiGroups } from '@discordy/core/domain/emojiModel';
import { searchShortcodes } from '@discordy/core/domain/emojiShortcodes';
import { quickApiForm, type QuickEmoji } from '@discordy/core/domain/quickReactions';

export const COLUMNS = 8;

export interface PickerSection {
  id: string;
  title: string;
  emoji: QuickEmoji[];
}

export type PickerRow = { kind: 'header'; key: string; title: string } | { kind: 'emoji'; key: string; items: QuickEmoji[] };

interface GuildLike {
  id: string;
  name: string;
  emojis?: Emoji[];
}

const unicode = (name: string): QuickEmoji => ({ id: null, name });

/** The picker's sections: recently used, the server's custom emoji, then the unicode categories. A search replaces them with one list of matches. */
export function pickerSections(input: { recent: QuickEmoji[]; guilds: GuildLike[]; guildId: string | null | undefined; query: string }): PickerSection[] {
  const query = input.query.trim().toLowerCase();
  const groups = usableEmojiGroups(input.guilds, input.guildId, false, query);
  const custom = groups.map((g) => ({ id: `guild:${g.guildId}`, title: g.guildName, emoji: g.emoji.map((e): QuickEmoji => ({ id: e.id, name: e.name, animated: e.animated ?? false })) }));
  if (query) {
    const matches = searchShortcodes(query, 60).map((m) => unicode(m.emoji));
    const results = [...custom.flatMap((s) => s.emoji), ...matches];
    return results.length > 0 ? [{ id: 'results', title: 'Results', emoji: results }] : [];
  }
  const frequent = input.recent.length > 0 ? [{ id: 'recent', title: 'Frequently used', emoji: input.recent }] : [];
  return [...frequent, ...custom, ...EMOJI_CATEGORIES.map((c) => ({ id: c.id, title: c.label, emoji: c.emoji.map(unicode) }))];
}

/** Flat list rows for a FlatList: a header, then the section's emoji in rows of `COLUMNS`. */
export function pickerRows(sections: PickerSection[], columns = COLUMNS): PickerRow[] {
  const rows: PickerRow[] = [];
  for (const section of sections) {
    rows.push({ kind: 'header', key: `h:${section.id}`, title: section.title });
    for (let at = 0; at < section.emoji.length; at += columns) {
      rows.push({ kind: 'emoji', key: `${section.id}:${at}`, items: section.emoji.slice(at, at + columns) });
    }
  }
  return rows;
}

/** What a custom emoji looks like inside message text (`<:name:id>` or `<a:name:id>`); unicode emoji are inserted as they are. */
export function emojiText(emoji: QuickEmoji): string {
  return emoji.id ? `<${emoji.animated ? 'a' : ''}:${emoji.name}:${emoji.id}>` : emoji.name;
}

/** Inserts text at the cursor (or replaces the selection) and returns the new text and where the cursor goes. */
export function insertAt(text: string, selection: { start: number; end: number }, insert: string): { text: string; cursor: number } {
  const start = Math.min(selection.start, selection.end);
  const end = Math.max(selection.start, selection.end);
  return { text: text.slice(0, start) + insert + text.slice(end), cursor: start + insert.length };
}

export const emojiKey = quickApiForm;
