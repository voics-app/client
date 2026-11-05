/** Ranking behind the settings search of every client: pages and rows scored against a query, best first. */
import { rowSlug } from './rowSlug';

export interface SettingsPageInfo<Id extends string> {
  id: Id;
  label: string;
  /** Extra words that find the page without being in its title. */
  keywords: string;
}

export interface SettingsRowInfo<Id extends string> {
  page: Id;
  /** The row's title as shown. */
  label: string;
  keywords?: string;
}

export interface SettingsHit<Id extends string> {
  page: Id;
  pageLabel: string;
  label: string;
  /** `rowSlug` of the row's title; null when the hit is the page itself. */
  rowId: string | null;
}

/** Lower is better; null when a word of the query matches nowhere. Every word of the query must match. */
export function scoreSetting(query: string, label: string, keywords: string): number | null {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;
  const l = label.toLowerCase();
  const rest = keywords.toLowerCase();
  let total = 0;
  for (const t of tokens) {
    if (l.startsWith(t)) total += 0;
    else if (l.split(/[^a-z0-9]+/).some((w) => w.startsWith(t))) total += 1;
    else if (l.includes(t)) total += 2;
    else if (rest.includes(t)) total += 4;
    else return null;
  }
  return total;
}

/** Pages and rows matching `query`, best first; a page edges out a row with the same score. An empty query yields nothing. */
export function searchSettingsIndex<Id extends string>(
  query: string,
  pages: readonly SettingsPageInfo<Id>[],
  rows: readonly SettingsRowInfo<Id>[],
  limit = 12,
): SettingsHit<Id>[] {
  const scored: { hit: SettingsHit<Id>; s: number; order: number }[] = [];
  let order = 0;
  for (const page of pages) {
    const pageScore = scoreSetting(query, page.label, page.keywords);
    if (pageScore !== null) scored.push({ hit: { page: page.id, pageLabel: page.label, label: page.label, rowId: null }, s: pageScore - 0.5, order: order++ });
    for (const row of rows) {
      if (row.page !== page.id) continue;
      const s = scoreSetting(query, row.label, `${row.keywords ?? ''} ${page.label}`);
      if (s !== null) scored.push({ hit: { page: page.id, pageLabel: page.label, label: row.label, rowId: rowSlug(row.label) }, s, order: order++ });
    }
  }
  return scored.sort((a, b) => a.s - b.s || a.order - b.order).slice(0, limit).map((x) => x.hit);
}
