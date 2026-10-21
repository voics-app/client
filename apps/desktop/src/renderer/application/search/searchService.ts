/** Runs message searches: on the server for Standard chats, in the local store for Ephemeral and P2P chats. */
import type { Channel, DeliveryMode, Message } from '@shared/contracts/rest';
import { highlightTerms, matchesLocal, parseQuery, toSearchParams, type SearchParams, type SuggestionContext } from '@renderer/domain/messageSearch';
import { compareSnowflakes } from '@renderer/domain/snowflake';
import type { ApiPort } from '../ports/api';
import { SEARCH_PAGE_SIZE, useSearchStore, type SearchSort } from '../stores/searchStore';

export interface SearchTarget {
  channel: Channel;
  guildName: string | null;
  mode: DeliveryMode;
  candidates: SuggestionContext;
}

export interface SearchServiceDeps {
  api: Pick<ApiPort, 'searchMessages'>;
  localMessages(channelId: string): Promise<Message[]>;
}

const SORTS: Record<SearchSort, Pick<SearchParams, 'sort_by' | 'sort_order'>> = {
  newest: { sort_by: 'timestamp', sort_order: 'desc' },
  oldest: { sort_by: 'timestamp', sort_order: 'asc' },
  relevant: { sort_by: 'relevance', sort_order: 'desc' },
};

function errorText(error: unknown): string {
  const status = (error as { status?: number }).status;
  if (status === 429) return 'You are searching too fast. Try again in a few seconds.';
  if (status === 503) return 'Search is unavailable right now.';
  return error instanceof Error ? error.message : 'Search failed';
}

export class SearchService {
  /** Guards against a slow response replacing a newer search. */
  private ticket = 0;

  constructor(private readonly deps: SearchServiceDeps) {}

  async run(target: SearchTarget, input: string, options: { offset?: number } = {}): Promise<void> {
    const store = useSearchStore.getState();
    const parsed = parseQuery(input);
    const offset = options.offset ?? 0;
    const scopeLabel = target.channel.guild_id ? (target.guildName ?? 'this server') : `#${target.channel.name ?? 'this chat'}`;
    if (!parsed.text && parsed.filters.length === 0) {
      store.set({ submitted: '', status: 'idle', error: null, problems: [], groups: [], total: 0, offset: 0 });
      return;
    }
    const sort = target.mode === 'standard' ? store.sort : 'newest';
    const { params, problems } = toSearchParams(parsed, target.candidates, { ...SORTS[sort], offset, limit: SEARCH_PAGE_SIZE });
    const base = { input, submitted: input, terms: highlightTerms(parsed.text), scopeLabel, offset, problems, local: target.mode !== 'standard' };
    if (problems.length > 0) {
      store.set({ ...base, status: 'error', error: problems.join('. '), groups: [], total: 0 });
      return;
    }
    const ticket = ++this.ticket;
    store.set({ ...base, status: 'loading', error: null });
    try {
      const result = target.mode === 'standard' ? await this.remote(target, params) : await this.local(target, params, sort, offset);
      if (ticket !== this.ticket) return;
      useSearchStore.getState().set({ status: 'ready', groups: result.groups, total: result.total, indexBuilding: result.indexBuilding });
    } catch (error) {
      if (ticket !== this.ticket) return;
      useSearchStore.getState().set({ status: 'error', error: errorText(error), groups: [], total: 0 });
    }
  }

  private async remote(target: SearchTarget, params: SearchParams) {
    const guildId = target.channel.guild_id ?? null;
    // `in:` only exists for server searches; a channel search is already scoped.
    const scoped = guildId ? params : { ...params, channel_id: undefined };
    const response = await this.deps.api.searchMessages({ guildId, channelId: target.channel.id }, scoped);
    return { groups: response.messages, total: response.total_results, indexBuilding: response.index_building === true };
  }

  private async local(target: SearchTarget, params: SearchParams, sort: SearchSort, offset: number) {
    const all = await this.deps.localMessages(target.channel.id);
    const matches = all.filter((m) => matchesLocal(m, params)).sort((a, b) => compareSnowflakesSafe(b, a));
    const page = (sort === 'oldest' ? [...matches].reverse() : matches).slice(offset, offset + SEARCH_PAGE_SIZE);
    const groups = page.map((hit) => {
      const i = all.findIndex((m) => m.id === hit.id);
      return [all[i - 1], { ...hit, hit: true }, all[i + 1]].filter((m): m is Message => Boolean(m));
    });
    return { groups, total: matches.length, indexBuilding: false };
  }
}

/** Local ids are not snowflakes, so order by time and fall back to ids. */
function compareSnowflakesSafe(a: Message, b: Message): number {
  const byTime = Date.parse(a.timestamp) - Date.parse(b.timestamp);
  if (byTime !== 0) return byTime;
  try {
    return compareSnowflakes(a.id, b.id);
  } catch {
    return a.id.localeCompare(b.id);
  }
}
