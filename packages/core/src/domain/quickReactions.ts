export interface QuickEmoji {
  id: string | null;
  name: string;
  animated?: boolean;
}

export const DEFAULT_QUICK_REACTIONS: QuickEmoji[] = [
  { id: null, name: '👍' },
  { id: null, name: '❤️' },
  { id: null, name: '😂' },
  { id: null, name: '🎉' },
];

export const MAX_RECENT_REACTIONS = 8;
export const QUICK_COUNT = 4;

/** Reaction API form: the unicode character, or `name:id` for custom emoji. */
export const quickApiForm = (e: QuickEmoji): string => (e.id ? `${e.name}:${e.id}` : e.name);

/** Most-recent-first list without duplicates, capped. */
export function recordReaction(recent: QuickEmoji[], emoji: QuickEmoji): QuickEmoji[] {
  const k = quickApiForm(emoji);
  return [emoji, ...recent.filter((e) => quickApiForm(e) !== k)].slice(0, MAX_RECENT_REACTIONS);
}

/** Up to four quick reactions: recent first, topped up from the defaults. */
export function quickReactions(recent: QuickEmoji[]): QuickEmoji[] {
  const seen = new Set<string>();
  const out: QuickEmoji[] = [];
  for (const e of [...recent, ...DEFAULT_QUICK_REACTIONS]) {
    const k = quickApiForm(e);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(e);
    if (out.length === QUICK_COUNT) break;
  }
  return out;
}

export function parseApiEmoji(api: string): QuickEmoji {
  const i = api.lastIndexOf(':');
  return i > 0 ? { name: api.slice(0, i), id: api.slice(i + 1) } : { id: null, name: api };
}
