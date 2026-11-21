import { createI18n } from '../domain/i18n';
/** Runs message searches: on the server for Standard chats, in the local store for Ephemeral and P2P chats. */
import type { Channel, DeliveryMode, Message } from '@discordy/core/contracts/rest';
import { highlightTerms, matchesLocal, parseQuery, toSearchParams, type SearchParams, type SuggestionContext } from '@discordy/core/domain/messageSearch';
import { compareSnowflakes } from '@discordy/core/domain/snowflake';
import type { ApiPort } from '@discordy/core/application/ports/api';
import { SEARCH_PAGE_SIZE, useSearchStore, type SearchSort } from '@discordy/core/application/stores/searchStore';

export interface SearchTarget {
  channel: Channel;
  guildName: string | null;
  mode: DeliveryMode;
  candidates: SuggestionContext;
}

export interface SearchServiceDeps {
  api: Pick<ApiPort, 'searchMessages'>;
  localMessages(channelId: string): Promise<Message[]>;
  canShowChannel?(channelId: string): boolean;
  searchableChannelIds?(guildId: string): string[];
}

const SORTS: Record<SearchSort, Pick<SearchParams, 'sort_by' | 'sort_order'>> = {
  newest: { sort_by: 'timestamp', sort_order: 'desc' },
  oldest: { sort_by: 'timestamp', sort_order: 'asc' },
  relevant: { sort_by: 'relevance', sort_order: 'desc' },
};

export function errorText(error: unknown, locale?: string): string {
  const status = (error as { status?: number }).status;
  if (status === 429) return createI18n(locale).catalogText('You are searching too fast. Try again in a few seconds.');
  if (status === 503) return createI18n(locale).catalogText('Search is unavailable right now.');
  return createI18n(locale).catalogText(error instanceof Error ? error.message : 'Search failed');
}

/** One page of results, before it reaches any store. */
export interface SearchPage {
  groups: Message[][];
  total: number;
  indexBuilding: boolean;
  /** Words to highlight in the hits. */
  terms: string[];
}

export type SearchOutcome = { kind: 'empty' } | { kind: 'problems'; problems: string[] } | ({ kind: 'page' } & SearchPage);

export class SearchService {
  /** Guards against a slow response replacing a newer search. */
  private ticket = 0;

  constructor(private readonly deps: SearchServiceDeps) {}

  /** Runs one search without touching the search store: the page of results for `input` at `offset`, or why there is nothing to search. Throws what the server answered when it fails. */
  async page(target: SearchTarget, input: string, options: { offset?: number; sort?: SearchSort } = {}): Promise<SearchOutcome> {
    if (this.deps.canShowChannel && !this.deps.canShowChannel(target.channel.id)) return { kind: 'empty' };
    const parsed = parseQuery(input);
    if (!parsed.text && parsed.filters.length === 0) return { kind: 'empty' };
    const offset = options.offset ?? 0;
    const sort = target.mode === 'standard' ? (options.sort ?? 'newest') : 'newest';
    const { params, problems } = toSearchParams(parsed, target.candidates, { ...SORTS[sort], offset, limit: SEARCH_PAGE_SIZE });
    if (problems.length > 0) return { kind: 'problems', problems };
    const result = target.mode === 'standard' ? await this.remote(target, params) : await this.local(target, params, sort, offset);
    return { kind: 'page', ...result, terms: highlightTerms(parsed.text) };
  }

  async run(target: SearchTarget, input: string, options: { offset?: number } = {}): Promise<void> {
    const store = useSearchStore.getState();
    const parsed = parseQuery(input);
    const offset = options.offset ?? 0;
    const scopeLabel = target.channel.guild_id ? (target.guildName ?? createI18n(target.candidates.locale).catalogText('this server')) : `#${target.channel.name ?? createI18n(target.candidates.locale).catalogText('this chat')}`;
    const base = { input, submitted: input, terms: highlightTerms(parsed.text), scopeLabel, offset, problems: [] as string[], local: target.mode !== 'standard' };
    const ticket = ++this.ticket;
    let outcome: SearchOutcome;
    if (!parsed.text && parsed.filters.length === 0) {
      store.set({ submitted: '', status: 'idle', error: null, problems: [], groups: [], total: 0, offset: 0 });
      return;
    }
    store.set({ ...base, status: 'loading', error: null });
    try {
      outcome = await this.page(target, input, { offset, sort: store.sort });
    } catch (error) {
      if (ticket !== this.ticket) return;
      useSearchStore.getState().set({ status: 'error', error: errorText(error, target.candidates.locale), groups: [], total: 0 });
      return;
    }
    if (ticket !== this.ticket) return;
    if (outcome.kind === 'problems') {
      useSearchStore.getState().set({ ...base, problems: outcome.problems, status: 'error', error: outcome.problems.join('. '), groups: [], total: 0 });
    } else if (outcome.kind === 'page') {
      useSearchStore.getState().set({ status: 'ready', groups: outcome.groups, total: outcome.total, indexBuilding: outcome.indexBuilding });
    } else {
      useSearchStore.getState().set({ status: 'idle', groups: [], total: 0, error: null });
    }
  }

  private async remote(target: SearchTarget, params: SearchParams) {
    const guildId = target.channel.guild_id ?? null;
    // `in:` only exists for server searches; a channel search is already scoped.
    const allowed = guildId ? this.deps.searchableChannelIds?.(guildId) : undefined;
    const channelIds = allowed ? (params.channel_id ?? allowed).filter((id) => allowed.includes(id)) : params.channel_id;
    if (allowed && !channelIds?.length) return { groups: [], total: 0, indexBuilding: false };
    const scoped = guildId ? { ...params, channel_id: channelIds } : { ...params, channel_id: undefined };
    const response = await this.deps.api.searchMessages({ guildId, channelId: target.channel.id }, scoped);
    const groups = this.deps.canShowChannel ? response.messages.filter((group) => group.every((message) => this.deps.canShowChannel!(message.channel_id))) : response.messages;
    return { groups, total: response.total_results, indexBuilding: response.index_building === true };
  }

  private async local(target: SearchTarget, params: SearchParams, sort: SearchSort, offset: number) {
    const all = await this.deps.localMessages(target.channel.id);
    if (this.deps.canShowChannel && !this.deps.canShowChannel(target.channel.id)) return { groups: [], total: 0, indexBuilding: false };
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
