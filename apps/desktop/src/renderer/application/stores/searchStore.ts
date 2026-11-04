/** State of the message search box and its results panel. */
import { create } from 'zustand';
import type { Message } from '@discordy/core/contracts/rest';

export type SearchStatus = 'idle' | 'loading' | 'ready' | 'error';
export type SearchSort = 'newest' | 'oldest' | 'relevant';

export const SEARCH_PAGE_SIZE = 25;

export interface SearchState {
  /** The text in the search box. */
  input: string;
  /** The server or chat the results belong to; results are dropped when you move to another one. */
  scopeKey: string;
  /** What the shown results were searched for. */
  submitted: string;
  status: SearchStatus;
  error: string | null;
  /** Filters that name something unknown; shown instead of searching. */
  problems: string[];
  groups: Message[][];
  total: number;
  offset: number;
  sort: SearchSort;
  /** The server index is still being built, so results may be incomplete. */
  indexBuilding: boolean;
  /** Results came from the device (Ephemeral and P2P chats), not the server. */
  local: boolean;
  /** Words to highlight. */
  terms: string[];
  /** Where the results were searched, for the panel heading. */
  scopeLabel: string;
  set(patch: Partial<Omit<SearchState, 'set' | 'reset'>>): void;
  reset(): void;
}

const initial = {
  input: '',
  scopeKey: '',
  submitted: '',
  status: 'idle' as SearchStatus,
  error: null,
  problems: [],
  groups: [],
  total: 0,
  offset: 0,
  sort: 'newest' as SearchSort,
  indexBuilding: false,
  local: false,
  terms: [],
  scopeLabel: '',
};

export const useSearchStore = create<SearchState>((set) => ({
  ...initial,
  set: (patch) => set(patch),
  reset: () => set({ ...initial }),
}));
