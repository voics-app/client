import { useI18n } from '../../shared/i18n';
import { MagnifyingGlass, X } from '@phosphor-icons/react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useSearchStore } from '@discordy/core/application/stores/searchStore';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import { applySuggestion, suggest } from '@discordy/core/domain/messageSearch';
import { scopeKeyOf, searchTarget, submitSearch } from '../../app/searchActions';

/** Search box of the channel header: Ctrl+F focuses it, `from:`/`in:`/`has:` ... suggest as you type, Enter searches. */
export function SearchBar({ channelId }: { channelId: string }) {
  const { t, locale } = useI18n();
  const input = useSearchStore((s) => s.input);
  const scopeKey = useSearchStore((s) => s.scopeKey);
  const set = useSearchStore((s) => s.set);
  const focusTick = useUiStore((s) => s.searchFocus);
  const ref = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (focusTick === 0) return;
    ref.current?.focus();
    ref.current?.select();
    setOpen(true);
  }, [focusTick]);

  // Results belong to one server or chat; moving elsewhere starts a fresh search.
  useEffect(() => {
    const key = scopeKeyOf(channelId);
    if (scopeKey && scopeKey !== key) {
      useSearchStore.getState().reset();
      const ui = useUiStore.getState();
      if (ui.sidePanel?.kind === 'search') ui.setSidePanel(null);
    }
  }, [channelId, scopeKey]);

  const suggestions = useMemo(() => {
    if (!open) return [];
    const target = searchTarget(channelId);
    return target ? suggest(input, { ...target.candidates, locale }) : [];
  }, [open, input, channelId, locale]);

  const choose = (index: number) => {
    const picked = suggestions[index];
    if (!picked) return;
    set({ input: applySuggestion(input, picked) });
    setActive(0);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' && suggestions.length > 0) {
      e.preventDefault();
      setActive((i) => (i + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp' && suggestions.length > 0) {
      e.preventDefault();
      setActive((i) => (i - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === 'Tab' && suggestions.length > 0) {
      e.preventDefault();
      choose(active);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      // Enter completes a half-typed filter, otherwise it searches.
      const half = suggestions[active];
      if (half && input.trim() !== '' && !input.endsWith(' ') && half.insert !== `${input.split(' ').at(-1)} `) choose(active);
      else {
        setOpen(false);
        void submitSearch(channelId, input);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (open && suggestions.length > 0) setOpen(false);
      else ref.current?.blur();
    }
  };

  const clear = () => {
    useSearchStore.getState().reset();
    const ui = useUiStore.getState();
    if (ui.sidePanel?.kind === 'search') ui.setSidePanel({ kind: 'members' });
    ref.current?.focus();
  };

  return (
    <div className="search-box" role="search">
      <MagnifyingGlass size={16} className="search-box-icon" aria-hidden="true" />
      <input
        ref={ref}
        type="text"
        className="search-box-input"
        placeholder={t('common.search')}
        aria-label={t('search.messages')}
        aria-autocomplete="list"
        aria-expanded={open && suggestions.length > 0}
        aria-controls={listId}
        aria-activedescendant={open && suggestions.length > 0 ? `${listId}-${active}` : undefined}
        value={input}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => {
          set({ input: e.target.value });
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      />
      {input && (
        <button type="button" className="search-box-clear" aria-label={t('search.clear')} onMouseDown={(e) => e.preventDefault()} onClick={clear}>
          <X size={12} weight="bold" />
        </button>
      )}
      {open && suggestions.length > 0 && (
        <ul id={listId} role="listbox" className="search-suggestions" aria-label={t('search.filters')}>
          {suggestions.map((s, i) => (
            <li
              key={s.insert}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'is-active' : undefined}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(i);
              }}
            >
              <span>{s.label}</span>
              {s.hint && <small>{s.hint}</small>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
