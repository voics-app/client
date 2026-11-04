import { LockKey, MagnifyingGlass, WarningCircle, X } from '@phosphor-icons/react';
import { useMemo, useRef } from 'react';
import { useGuildStore } from '@renderer/application/stores/guildStore';
import { SEARCH_PAGE_SIZE, useSearchStore, type SearchSort } from '@renderer/application/stores/searchStore';
import { parseQuery, splitHighlight, withoutFilter, FILTER_KEYS } from '@discordy/core/domain/messageSearch';
import type { Message } from '@discordy/core/contracts/rest';
import { jumpToMessage, rerunSearch, submitSearch } from '../../app/searchActions';
import { displayName } from '../../shared/hooks/useNames';
import { useRovingFocus } from '../../shared/hooks/useRovingFocus';
import { Avatar } from '../../shared/ui/Avatar';
import { Button } from '../../shared/ui/Button';
import { EmptyState, Skeleton } from '../../shared/ui/Misc';

function Highlighted({ text, terms }: { text: string; terms: string[] }) {
  return (
    <>
      {splitHighlight(text, terms).map((part, i) => (part.hit ? <mark key={i}>{part.text}</mark> : <span key={i}>{part.text}</span>))}
    </>
  );
}

function SnippetLine({ message, terms }: { message: Message; terms: string[] }) {
  const hit = message.hit === true;
  const text = message.content || (message.attachments.length > 0 ? `${message.attachments.length} attachment(s)` : '');
  return (
    <p className={`search-line${hit ? ' is-hit' : ''}`}>
      {!hit && <strong>{displayName(message.author)}: </strong>}
      {hit ? <Highlighted text={text} terms={terms} /> : text}
    </p>
  );
}

function ResultCard({ group, terms, showChannel }: { group: Message[]; terms: string[]; showChannel: boolean }) {
  const hit = group.find((m) => m.hit) ?? group[0]!;
  const channel = useGuildStore((s) => s.channels[hit.channel_id]);
  return (
    <li>
      <button type="button" className="search-hit" onClick={() => jumpToMessage(hit.channel_id, hit.id)} aria-label={`Jump to message from ${displayName(hit.author)}`}>
        <header>
          <Avatar id={hit.author.id} name={displayName(hit.author)} avatar={hit.author.avatar} size={22} />
          <strong>{displayName(hit.author)}</strong>
          {showChannel && channel?.name && <span className="search-hit-channel">#{channel.name}</span>}
          <time dateTime={hit.timestamp}>{new Date(hit.timestamp).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</time>
        </header>
        {group.map((m) => (
          <SnippetLine key={m.id} message={m} terms={terms} />
        ))}
      </button>
    </li>
  );
}

const SORTS: { value: SearchSort; label: string }[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'relevant', label: 'Most relevant' },
];

export function SearchPanel({ channelId }: { channelId: string }) {
  const state = useSearchStore();
  const list = useRef<HTMLUListElement>(null);
  const filters = useMemo(() => parseQuery(state.submitted).filters, [state.submitted]);
  const channel = useGuildStore((s) => s.channels[channelId]);
  const pages = Math.max(1, Math.ceil(state.total / SEARCH_PAGE_SIZE));
  const page = Math.floor(state.offset / SEARCH_PAGE_SIZE) + 1;
  useRovingFocus(list, { selector: '.search-hit', enabled: state.status === 'ready' && state.groups.length > 0 });

  const removeFilter = (index: number) => {
    const token = filters[index];
    if (!token) return;
    const next = withoutFilter(state.submitted, token);
    state.set({ input: next });
    void submitSearch(channelId, next);
  };

  return (
    <div className="panel-body search-panel">
      {state.status === 'idle' && (
        <EmptyState
          icon={<MagnifyingGlass size={32} weight="light" />}
          title="Search messages"
          body={`Type words to find, or narrow it down with ${FILTER_KEYS.map((k) => `${k}:`).join(' ')}`}
        />
      )}
      {state.status !== 'idle' && (
        <>
          <div className="search-summary" aria-live="polite">
            {state.status === 'ready' && (
              <span>
                {state.total} {state.total === 1 ? 'result' : 'results'} in {state.scopeLabel}
              </span>
            )}
            {state.status === 'loading' && <span>Searching {state.scopeLabel}</span>}
            {!state.local && (
              <label className="search-sort">
                <span className="sr-only">Sort results</span>
                <select
                  value={state.sort}
                  onChange={(e) => {
                    state.set({ sort: e.target.value as SearchSort });
                    void rerunSearch(channelId);
                  }}
                >
                  {SORTS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          {filters.length > 0 && (
            <ul className="search-chips" aria-label="Active filters">
              {filters.map((f, i) => (
                <li key={f.raw} className="search-chip">
                  <span>{f.key}:{f.value}</span>
                  <button type="button" aria-label={`Remove filter ${f.key}:${f.value}`} onClick={() => removeFilter(i)}>
                    <X size={10} weight="bold" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {state.local && (
            <p className="search-note">
              <LockKey size={14} /> This chat is end-to-end encrypted, so only messages stored on this device are searched.
            </p>
          )}
          {state.indexBuilding && !state.local && <p className="search-note" role="status">The search index is still being built, so older messages may be missing for now.</p>}
        </>
      )}
      {state.status === 'loading' && (
        <div aria-busy="true" className="search-loading">
          {[0.9, 0.6, 0.8].map((w, i) => (
            <div key={i} className="search-skeleton">
              <Skeleton width={`${w * 100}%`} height={14} />
              <Skeleton width="70%" height={12} />
            </div>
          ))}
        </div>
      )}
      {state.status === 'error' && (
        <EmptyState
          icon={<WarningCircle size={32} weight="light" />}
          title="Search failed"
          body={state.error ?? 'Something went wrong.'}
          action={state.problems.length === 0 ? <Button variant="primary" onClick={() => void rerunSearch(channelId, state.offset)}>Try again</Button> : undefined}
        />
      )}
      {state.status === 'ready' && state.groups.length === 0 && (
        <EmptyState icon={<MagnifyingGlass size={32} weight="light" />} title="No results" body="Nothing matches. Try other words or remove a filter." />
      )}
      {state.status === 'ready' && state.groups.length > 0 && (
        <>
          <ul ref={list} className="search-results" aria-label="Search results">
            {state.groups.map((group) => (
              <ResultCard key={(group.find((m) => m.hit) ?? group[0]!).id} group={group} terms={state.terms} showChannel={Boolean(channel?.guild_id)} />
            ))}
          </ul>
          {pages > 1 && (
            <nav className="search-pager" aria-label="Result pages">
              <Button variant="ghost" disabled={page <= 1} onClick={() => void rerunSearch(channelId, state.offset - SEARCH_PAGE_SIZE)}>Previous</Button>
              <span>
                Page {page} of {pages}
              </span>
              <Button variant="ghost" disabled={page >= pages} onClick={() => void rerunSearch(channelId, state.offset + SEARCH_PAGE_SIZE)}>Next</Button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
