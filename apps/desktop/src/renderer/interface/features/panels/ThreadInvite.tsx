import { useInfiniteQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { attempt } from '../../app/actions';
import { getRuntime } from '../../app/runtime';
import { displayName } from '../../shared/hooks/useNames';
import { Button } from '../../shared/ui/Button';

const PAGE_SIZE = 100;

export function ThreadInvite({ guildId, threadId, onClose }: { guildId: string; threadId: string; onClose: () => void }) {
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);
  const members = useInfiniteQuery({
    queryKey: ['guild', guildId, 'thread-invite-members'],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => getRuntime().api.members(guildId, { limit: PAGE_SIZE, after: pageParam }),
    getNextPageParam: (last) => last.length === PAGE_SIZE ? last.at(-1)?.user.id : undefined,
  });
  const invite = async () => {
    if (!selected) return;
    setBusy(true);
    const added = await attempt(async () => { await getRuntime().api.joinThread(threadId, selected); return true; }, 'Could not invite member');
    setBusy(false);
    if (added) onClose();
  };

  return (
    <div className="thread-invite">
      <label htmlFor={`thread-invite-${threadId}`}>Invite a member</label>
      <select id={`thread-invite-${threadId}`} className="input" value={selected} onChange={(event) => setSelected(event.target.value)}>
        <option value="">Choose a member</option>
        {members.data?.pages.flat().map((member) => <option key={member.user.id} value={member.user.id}>{member.nick || displayName(member.user)}</option>)}
      </select>
      {members.isLoading && <p className="panel-note">Loading members…</p>}
      {members.isError && <p className="panel-note">Could not load members. <button type="button" onClick={() => void members.refetch()}>Try again</button></p>}
      {members.hasNextPage && <Button size="sm" variant="ghost" loading={members.isFetchingNextPage} onClick={() => void members.fetchNextPage()}>Load more members</Button>}
      <div className="row-end"><Button size="sm" variant="ghost" onClick={onClose}>Cancel</Button><Button size="sm" variant="primary" disabled={!selected} loading={busy} onClick={() => void invite()}>Invite</Button></div>
    </div>
  );
}
