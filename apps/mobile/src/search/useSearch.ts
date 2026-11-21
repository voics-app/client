import { useCallback, useMemo, useRef, useState } from 'react';
import { canShowChannelContent } from '@discordy/core/application/ageRestrictedAccess';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { SearchService, type SearchTarget } from '@discordy/core/application/searchService';
import { SEARCH_PAGE_SIZE, type SearchSort } from '@discordy/core/application/stores/searchStore';
import type { Message } from '@discordy/core/contracts/rest';
import { getRuntime } from '../runtime';
import { runSearch } from './searchRunner';
import type { SearchTab } from './searchTabs';

export interface SearchState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  groups: Message[][];
  total: number;
  hasMore: boolean;
  loadingMore: boolean;
  error: string | null;
  indexBuilding: boolean;
  /** Words to highlight in the hits. */
  terms: string[];
}

const IDLE: SearchState = { status: 'idle', groups: [], total: 0, hasMore: false, loadingMore: false, error: null, indexBuilding: false, terms: [] };

/** Search results for one tab, a page at a time. A newer search or tab replaces an older one that is still on its way. */
export function useSearch(target: SearchTarget | null) {
  // Mobile searches the server only; chats with private delivery cannot be opened here, so there is no local store to search.
  const service = useMemo(() => new SearchService({ api: getRuntime().api, localMessages: async () => [], canShowChannel: canShowChannelContent, searchableChannelIds: (guildId) => Object.values(useGuildStore.getState().channels).filter((c) => c.guild_id === guildId && canShowChannelContent(c.id)).map((c) => c.id) }), []);
  const [state, setState] = useState<SearchState>(IDLE);
  const ticket = useRef(0);
  const last = useRef<{ tab: SearchTab; input: string; loaded: number; sort: SearchSort } | null>(null);

  const search = useCallback(
    async (tab: SearchTab, input: string, sort: SearchSort = 'newest') => {
      const mine = ++ticket.current;
      last.current = { tab, input, loaded: 0, sort };
      if (!target || !input.trim()) {
        setState(IDLE);
        return;
      }
      setState((s) => ({ ...s, status: 'loading', error: null, groups: [], loadingMore: false }));
      const result = await runSearch(service, target, tab, input, 0, sort);
      if (mine !== ticket.current) return;
      if (result.kind === 'ready') {
        last.current = { tab, input, loaded: SEARCH_PAGE_SIZE, sort };
        setState({ status: 'ready', groups: result.groups, total: result.total, hasMore: result.hasMore, loadingMore: false, error: null, indexBuilding: result.indexBuilding, terms: result.terms });
      } else setState(result.kind === 'error' ? { ...IDLE, status: 'error', error: result.message } : IDLE);
    },
    [service, target],
  );

  const more = useCallback(async () => {
    const at = last.current;
    if (!target || !at || state.status !== 'ready' || !state.hasMore || state.loadingMore) return;
    const mine = ticket.current;
    setState((s) => ({ ...s, loadingMore: true }));
    const result = await runSearch(service, target, at.tab, at.input, at.loaded, at.sort);
    if (mine !== ticket.current) return;
    if (result.kind !== 'ready') {
      setState((s) => ({ ...s, loadingMore: false, hasMore: false, error: result.kind === 'error' ? result.message : null }));
      return;
    }
    last.current = { ...at, loaded: at.loaded + SEARCH_PAGE_SIZE };
    setState((s) => {
      const known = new Set(s.groups.map((g) => (g.find((m) => m.hit) ?? g[0])?.id));
      return { ...s, groups: [...s.groups, ...result.groups.filter((g) => !known.has((g.find((m) => m.hit) ?? g[0])?.id))], hasMore: result.hasMore, loadingMore: false };
    });
  }, [service, target, state.status, state.hasMore, state.loadingMore]);

  return { state, search, more };
}
