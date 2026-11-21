import { ChatsCircle } from '@phosphor-icons/react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import { getRuntime } from '../../app/runtime';
import { Button } from '../../shared/ui/Button';
import { EmptyState } from '../../shared/ui/Misc';

export function ThreadsPanel({ channelId }: { channelId: string }) {
  const [archived, setArchived] = useState(false);
  const [search, setSearch] = useState('');
  const threads = useQuery({
    queryKey: ['channel', channelId, 'threads', archived],
    queryFn: () => getRuntime().api.listThreads(channelId, archived),
  });
  const visible = threads.data?.filter((thread) => (thread.name ?? '').toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));

  return (
    <div className="panel-body threads-browser">
      <div className="threads-tabs" aria-label="Thread status">
        <Button size="sm" variant={archived ? 'ghost' : 'primary'} onClick={() => setArchived(false)} aria-pressed={!archived}>Active</Button>
        <Button size="sm" variant={archived ? 'primary' : 'ghost'} onClick={() => setArchived(true)} aria-pressed={archived}>Archived</Button>
      </div>
      <input className="input" aria-label="Search threads" placeholder="Search threads" value={search} onChange={(event) => setSearch(event.target.value)} />
      {threads.isLoading && <p className="panel-note">Loading threads…</p>}
      {threads.isError && <p className="panel-note">Could not load threads. <button type="button" onClick={() => void threads.refetch()}>Try again</button></p>}
      {visible?.length === 0 && <EmptyState icon={<ChatsCircle size={32} weight="light" />} title={search ? 'No matching threads' : `No ${archived ? 'archived' : 'active'} threads`} body={search ? 'Try another search.' : 'Threads from this channel appear here.'} />}
      <ul className="threads-list">
        {visible?.map((thread) => (
          <li key={thread.id}>
            <button type="button" className="threads-list-item" onClick={() => {
              useGuildStore.getState().upsertChannel(thread);
              useUiStore.getState().setSidePanel({ kind: 'thread', threadId: thread.id });
            }}>
              <ChatsCircle size={20} aria-hidden="true" />
              <span><strong>{thread.name || 'Untitled thread'}</strong><small>{thread.member_count === undefined ? 'Thread' : `${thread.member_count} ${thread.member_count === 1 ? 'member' : 'members'}`}</small></span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
