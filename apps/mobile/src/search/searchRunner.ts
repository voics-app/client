import type { SearchService, SearchTarget } from '@discordy/core/application/searchService';
import { errorText } from '@discordy/core/application/searchService';
import { SEARCH_PAGE_SIZE, type SearchSort } from '@discordy/core/application/stores/searchStore';
import type { Message } from '@discordy/core/contracts/rest';
import { compareSnowflakes } from '@discordy/core/domain/snowflake';
import { tabQueries, type SearchTab } from './searchTabs';

export type SearchResult =
  | { kind: 'empty' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; groups: Message[][]; total: number; hasMore: boolean; indexBuilding: boolean; terms: string[] };

const hitOf = (group: Message[]): Message => group.find((m) => m.hit) ?? group[0]!;

/** Runs the searches of a tab at an offset and merges them: one list of groups, newest hit first, each hit once. */
export async function runSearch(service: SearchService, target: SearchTarget, tab: SearchTab, input: string, offset: number, sort: SearchSort = 'newest'): Promise<SearchResult> {
  if (!input.trim()) return { kind: 'empty' };
  try {
    const outcomes = await Promise.all(tabQueries(tab, input).map((query) => service.page(target, query, { offset, sort })));
    const problems = outcomes.flatMap((o) => (o.kind === 'problems' ? o.problems : []));
    if (problems.length > 0) return { kind: 'error', message: [...new Set(problems)].join('. ') };
    const pages = outcomes.flatMap((o) => (o.kind === 'page' ? [o] : []));
    const seen = new Set<string>();
    const groups = pages
      .flatMap((p) => p.groups)
      .filter((g) => g.length > 0 && !seen.has(hitOf(g).id) && seen.add(hitOf(g).id))
      // Most relevant keeps the order the server ranked them in; the other two sort by time.
      .sort((a, b) => (sort === 'relevant' ? 0 : sort === 'oldest' ? compareSnowflakes(hitOf(a).id, hitOf(b).id) : compareSnowflakes(hitOf(b).id, hitOf(a).id)));
    return {
      kind: 'ready',
      groups,
      total: pages.reduce((sum, p) => sum + p.total, 0),
      hasMore: pages.some((p) => offset + SEARCH_PAGE_SIZE < p.total),
      indexBuilding: pages.some((p) => p.indexBuilding),
      terms: pages[0]?.terms ?? [],
    };
  } catch (error) {
    return { kind: 'error', message: errorText(error) };
  }
}
