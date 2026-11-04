import { Compass, MagnifyingGlass, UsersThree } from '@phosphor-icons/react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useGuildStore } from '@renderer/application/stores/guildStore';
import { categoryLabel, memberCountLabel } from '@discordy/core/domain/discoveryModel';
import type { DiscoveryGuild } from '@discordy/core/contracts/rest';
import { attempt } from '../../app/actions';
import { openGuild } from '../../app/navigation';
import { getRuntime } from '../../app/runtime';
import { Avatar } from '../../shared/ui/Avatar';
import { Button } from '../../shared/ui/Button';
import { Input } from '../../shared/ui/Form';
import { EmptyState, Skeleton } from '../../shared/ui/Misc';

const PAGE_SIZE = 24;

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

function GuildCard({ guild, onTag }: { guild: DiscoveryGuild; onTag: (tag: string) => void }) {
  const joined = useGuildStore((s) => Boolean(s.guilds[guild.id]));
  const [busy, setBusy] = useState(false);
  const join = async () => {
    setBusy(true);
    const ok = await attempt(async () => {
      await getRuntime().api.joinDiscoveryGuild(guild.id);
      return true;
    }, 'Could not join this server');
    setBusy(false);
    if (ok) openGuild(guild.id);
  };
  return (
    <li className="discover-card">
      <div className="discover-card-head">
        <Avatar id={guild.id} name={guild.name} avatar={guild.icon} size={56} square kind="icons" />
        <div className="discover-card-title">
          <h3>{guild.name}</h3>
          <span className="discover-category">{categoryLabel(guild.category)}</span>
        </div>
      </div>
      <p className="discover-desc">{guild.description}</p>
      {guild.tags.length > 0 && (
        <ul className="discover-tags" aria-label="Tags">
          {guild.tags.map((tag) => (
            <li key={tag}>
              <button type="button" className="discover-tag" onClick={() => onTag(tag)}>#{tag}</button>
            </li>
          ))}
        </ul>
      )}
      <div className="discover-card-foot">
        <span className="discover-counts">
          {guild.approximate_presence_count !== null && <span className="discover-online">{guild.approximate_presence_count.toLocaleString('en-US')} online</span>}
          <span>{memberCountLabel(guild.approximate_member_count)}</span>
        </span>
        {joined ? (
          <Button variant="ghost" onClick={() => openGuild(guild.id)}>Open</Button>
        ) : (
          <Button variant="primary" loading={busy} onClick={() => void join()}>Join</Button>
        )}
      </div>
    </li>
  );
}

export function DiscoverView() {
  const [text, setText] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  const query = useDebounced(text.trim(), 250);
  const categories = useQuery({ queryKey: ['discovery', 'categories'], queryFn: () => getRuntime().api.discoveryCategories(), staleTime: 300_000 });
  const results = useInfiniteQuery({
    queryKey: ['discovery', 'guilds', query, category, tag],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      getRuntime().api.discoveryGuilds({ query: query || undefined, category: category ?? undefined, tag: tag ?? undefined, limit: PAGE_SIZE, offset: pageParam }),
    getNextPageParam: (last) => (last.offset + last.guilds.length < last.total ? last.offset + last.guilds.length : undefined),
  });
  const guilds = results.data?.pages.flatMap((p) => p.guilds) ?? [];
  const total = results.data?.pages[0]?.total ?? 0;

  return (
    <section className="discover" aria-label="Discover servers">
      <header className="channel-header">
        <div className="channel-header-title"><Compass size={22} className="channel-header-icon" /><h1>Discover</h1></div>
      </header>
      <div className="discover-body">
        <div className="discover-hero">
          <h2>Find your community</h2>
          <p>Browse public servers that opted in to be listed.</p>
          <Input aria-label="Search servers" data-autofocus placeholder="Search servers" leading={<MagnifyingGlass size={18} />} value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        <div className="discover-filters" role="group" aria-label="Categories">
          <button type="button" className={`chip${category === null ? ' is-active' : ''}`} aria-pressed={category === null} onClick={() => setCategory(null)}>All</button>
          {categories.data?.map((c) => (
            <button key={c} type="button" className={`chip${category === c ? ' is-active' : ''}`} aria-pressed={category === c} onClick={() => setCategory(category === c ? null : c)}>{categoryLabel(c)}</button>
          ))}
          {tag && <button type="button" className="chip is-active" onClick={() => setTag(null)} aria-label={`Remove tag filter ${tag}`}>#{tag} ×</button>}
        </div>
        {results.isLoading ? (
          <div className="discover-grid">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} height={190} radius={16} />)}</div>
        ) : results.isError ? (
          <EmptyState icon={<Compass size={40} />} title="Could not load servers" body="Check your connection and try again." action={<Button variant="primary" onClick={() => void results.refetch()}>Retry</Button>} />
        ) : guilds.length === 0 ? (
          <EmptyState icon={<UsersThree size={40} />} title="No servers found" body={query || category || tag ? 'Try a different search or remove a filter.' : 'No server has opted in to discovery yet.'} />
        ) : (
          <>
            <p className="discover-total" role="status">{total.toLocaleString('en-US')} {total === 1 ? 'server' : 'servers'}</p>
            <ul className="discover-grid">
              {guilds.map((g) => <GuildCard key={g.id} guild={g} onTag={setTag} />)}
            </ul>
            {results.hasNextPage && (
              <div className="discover-more">
                <Button variant="ghost" loading={results.isFetchingNextPage} onClick={() => void results.fetchNextPage()}>Show more</Button>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
