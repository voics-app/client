/** Quick switcher (Ctrl+K) model: prefix modes, scoring and ranking with recent and unread boosts. Pure, no stores. */

export type SwitcherMode = 'all' | 'people' | 'text' | 'voice' | 'server';
export type SwitcherKind = 'dm' | 'text' | 'voice' | 'guild' | 'action';

export interface SwitcherItem {
  id: string;
  kind: SwitcherKind;
  label: string;
  hint?: string;
  keywords?: string;
  /** Server the channel belongs to (for the `*server channel` form). */
  guildId?: string;
  unread?: boolean;
  mentions?: number;
  /** 0 is the most recently visited; undefined when not in the recent list. */
  recent?: number;
}

export const MODE_PREFIXES: Readonly<Record<string, SwitcherMode>> = { '@': 'people', '#': 'text', '!': 'voice', '*': 'server' };
export const MODE_LABELS: Readonly<Record<SwitcherMode, string>> = { all: 'Everything', people: 'People', text: 'Text channels', voice: 'Voice channels', server: 'Servers' };

export interface ParsedQuery {
  mode: SwitcherMode;
  /** The search text without the prefix, trimmed at the start. */
  term: string;
  /** In server mode, the text after the first space: it narrows to channels of the matching servers. */
  channelTerm: string | null;
}

export function parseQuery(raw: string): ParsedQuery {
  const mode = MODE_PREFIXES[raw.charAt(0)];
  if (!mode) return { mode: 'all', term: raw.trim(), channelTerm: null };
  const rest = raw.slice(1).replace(/^\s+/, '');
  if (mode === 'server') {
    const space = rest.indexOf(' ');
    if (space >= 0) return { mode, term: rest.slice(0, space), channelTerm: rest.slice(space + 1).trim() };
  }
  return { mode, term: rest.trim(), channelTerm: null };
}

/** Text match tier: 100 prefix, 50 substring, 10 subsequence, 0 no match; everything matches an empty term. */
export function matchScore(term: string, item: Pick<SwitcherItem, 'label' | 'hint' | 'keywords'>): number {
  if (!term) return 1;
  const q = term.toLowerCase();
  const label = item.label.toLowerCase().replace(/^#/, '');
  if (label.startsWith(q)) return 100;
  const hay = `${item.label} ${item.hint ?? ''} ${item.keywords ?? ''}`.toLowerCase();
  if (hay.includes(q)) return 50;
  let i = 0;
  for (const ch of hay) if (ch === q[i]) i += 1;
  return i === q.length ? 10 : 0;
}

const inMode = (mode: SwitcherMode, kind: SwitcherKind): boolean =>
  mode === 'all' || (mode === 'people' && kind === 'dm') || (mode === 'text' && kind === 'text') || (mode === 'voice' && kind === 'voice') || (mode === 'server' && kind === 'guild');

/** Higher is more relevant: mentions, then unread, then recently visited (newest first). */
function boost(item: SwitcherItem): number {
  const mention = (item.mentions ?? 0) > 0 ? 3000 : 0;
  const unread = item.unread ? 2000 : 0;
  const recent = item.recent === undefined ? 0 : Math.max(1, 1000 - item.recent);
  return mention + unread + recent;
}

const isChannelKind = (k: SwitcherKind): boolean => k === 'dm' || k === 'text' || k === 'voice';

/**
 * Filters and orders the items for a raw query.
 * Empty term: recently visited first (newest first), then unread (mentions first), then the rest in the given order.
 * With a term: text match tier first, then the same relevance boost.
 */
export function rankItems<T extends SwitcherItem>(items: readonly T[], raw: string, limit = 30): { mode: SwitcherMode; items: T[] } {
  const { mode, term, channelTerm } = parseQuery(raw);
  const pool = items.filter((i) => inMode(mode, i.kind));
  if (mode === 'server' && channelTerm !== null) {
    const guilds = new Set(pool.filter((i) => matchScore(term, i) > 0).map((i) => i.id));
    const scoped = items.filter((i) => isChannelKind(i.kind) && i.kind !== 'dm' && i.guildId !== undefined && guilds.has(i.guildId));
    return { mode, items: scoped.map((i, order) => ({ i, order, s: matchScore(channelTerm, i) })).filter((r) => r.s > 0).sort((a, b) => b.s - a.s || boost(b.i) - boost(a.i) || a.order - b.order).slice(0, limit).map((r) => r.i) };
  }
  const ranked = pool
    .map((i, order) => ({ i, order, s: matchScore(term, i) }))
    .filter((r) => r.s > 0)
    .sort((a, b) => (term ? b.s - a.s : 0) || boost(b.i) - boost(a.i) || a.order - b.order);
  return { mode, items: ranked.slice(0, limit).map((r) => r.i) };
}

/** Most recently visited channel ids from a history of views, newest first, without duplicates. */
export function recentChannelIds(entries: readonly { channelId: string | null }[], limit = 10): string[] {
  const seen = new Set<string>();
  for (let i = entries.length - 1; i >= 0 && seen.size < limit; i -= 1) {
    const id = entries[i]!.channelId;
    if (id) seen.add(id);
  }
  return [...seen];
}
