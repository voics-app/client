import { useI18n } from '../../shared/i18n';
import { useChannelContentAccess } from '../../shared/hooks/useChannelContentAccess';
import { LockKey, MagnifyingGlass, WarningCircle, X } from '@phosphor-icons/react';
import { useMemo, useRef } from 'react';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { SEARCH_PAGE_SIZE, SEARCH_SORTS, useSearchStore, type SearchSort } from '@discordy/core/application/stores/searchStore';
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
  const { t } = useI18n();
  const hit = message.hit === true;
  const text = message.content || (message.attachments.length > 0 ? t('search.attachments', { count: message.attachments.length }) : '');
  return (
    <p className={`search-line${hit ? ' is-hit' : ''}`}>
      {!hit && <strong>{displayName(message.author)}: </strong>}
      {hit ? <Highlighted text={text} terms={terms} /> : text}
    </p>
  );
}

function ResultCard({ group, terms, showChannel }: { group: Message[]; terms: string[]; showChannel: boolean }) {
  const { canShow } = useChannelContentAccess();
  const { t, date } = useI18n();
  const hit = group.find((m) => m.hit) ?? group[0]!;
  const channel = useGuildStore((s) => s.channels[hit.channel_id]);
  if (!group.every((message) => canShow(message.channel_id))) return null;
  return (
    <li>
      <button type="button" className="search-hit" onClick={() => jumpToMessage(hit.channel_id, hit.id)} aria-label={t('search.jump', { name: displayName(hit.author) })}>
        <header>
          <Avatar id={hit.author.id} name={displayName(hit.author)} avatar={hit.author.avatar} size={22} />
          <strong>{displayName(hit.author)}</strong>
          {showChannel && channel?.name && <span className="search-hit-channel">#{channel.name}</span>}
          <time dateTime={hit.timestamp}>{date(new Date(hit.timestamp), { dateStyle: 'medium', timeStyle: 'short' })}</time>
        </header>
        {group.map((m) => (
          <SnippetLine key={m.id} message={m} terms={terms} />
        ))}
      </button>
    </li>
  );
}

const SORTS = SEARCH_SORTS;

export function SearchPanel({ channelId }: { channelId: string }) {
  const { t } = useI18n();
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
          title={t('search.messages')}
          body={t('search.help', { filters: FILTER_KEYS.map((k) => `${k}:`).join(' ') })}
        />
      )}
      {state.status !== 'idle' && (
        <>
          <div className="search-summary" aria-live="polite">
            {state.status === 'ready' && (
              <span>
                {t('search.resultsIn', { count: state.total, scope: state.scopeLabel })}
              </span>
            )}
            {state.status === 'loading' && <span>{t('search.searching', { scope: state.scopeLabel })}</span>}
            {!state.local && (
              <label className="search-sort">
                <span className="sr-only">{t('search.sort')}</span>
                <select
                  value={state.sort}
                  onChange={(e) => {
                    state.set({ sort: e.target.value as SearchSort });
                    void rerunSearch(channelId);
                  }}
                >
                  {SORTS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {t(`search.${s.value}`)}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          {filters.length > 0 && (
            <ul className="search-chips" aria-label={t('search.activeFilters')}>
              {filters.map((f, i) => (
                <li key={f.raw} className="search-chip">
                  <span>{f.key}:{f.value}</span>
                  <button type="button" aria-label={t('search.removeFilter', { filter: `${f.key}:${f.value}` })} onClick={() => removeFilter(i)}>
                    <X size={10} weight="bold" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {state.local && (
            <p className="search-note">
              <LockKey size={14} /> {t('search.local')}
            </p>
          )}
          {state.indexBuilding && !state.local && <p className="search-note" role="status">{t('search.indexBuilding')}</p>}
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
          title={t('search.failed')}
          body={state.error ?? t('common.failed')}
          action={state.problems.length === 0 ? <Button variant="primary" onClick={() => void rerunSearch(channelId, state.offset)}>{t('common.retry')}</Button> : undefined}
        />
      )}
      {state.status === 'ready' && state.groups.length === 0 && (
        <EmptyState icon={<MagnifyingGlass size={32} weight="light" />} title={t('search.empty')} body={t('search.emptyHelp')} />
      )}
      {state.status === 'ready' && state.groups.length > 0 && (
        <>
          <ul ref={list} className="search-results" aria-label={t('search.results')}>
            {state.groups.map((group) => (
              <ResultCard key={(group.find((m) => m.hit) ?? group[0]!).id} group={group} terms={state.terms} showChannel={Boolean(channel?.guild_id)} />
            ))}
          </ul>
          {pages > 1 && (
            <nav className="search-pager" aria-label={t('search.pages')}>
              <Button variant="ghost" disabled={page <= 1} onClick={() => void rerunSearch(channelId, state.offset - SEARCH_PAGE_SIZE)}>{t('search.previous')}</Button>
              <span>
                {t('search.page', { page, pages })}
              </span>
              <Button variant="ghost" disabled={page >= pages} onClick={() => void rerunSearch(channelId, state.offset + SEARCH_PAGE_SIZE)}>{t('search.next')}</Button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
