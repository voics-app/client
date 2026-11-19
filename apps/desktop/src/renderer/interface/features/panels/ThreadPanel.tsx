import { DotsThree } from '@phosphor-icons/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import { Permission } from '@discordy/core/contracts/permissions';
import { attempt } from '../../app/actions';
import { getRuntime } from '../../app/runtime';
import { can, useChannelPermissions } from '../../shared/hooks/usePermissions';
import { IconButton } from '../../shared/ui/IconButton';
import { Menu, useMenu, type MenuEntry } from '../../shared/ui/Menu';
import { NotificationBell } from '../chat/ChannelHeader';
import { Composer } from '../chat/Composer';
import { MessageList } from '../chat/MessageList';

export function ThreadPanel({ threadId }: { threadId: string }) {
  const storedThread = useGuildStore((s) => s.channels[threadId]);
  const me = useSessionStore((s) => s.user?.id);
  const permissions = useChannelPermissions(threadId);
  const menu = useMenu();
  const queryClient = useQueryClient();
  const detail = useQuery({ queryKey: ['thread', threadId], queryFn: () => getRuntime().api.channel(threadId) });
  const thread = detail.data ?? storedThread;
  if (!thread) return <p className="panel-note">This thread is no longer available.</p>;
  const manages = can(permissions, Permission.MANAGE_THREADS);
  const mayArchive = manages || thread.owner_id === me;
  const metadata = thread.thread_metadata;
  const update = async (patch: { archived?: boolean; locked?: boolean }) => {
    const updated = await attempt(() => getRuntime().api.updateThread(threadId, patch), 'Could not update thread');
    if (!updated) return;
    useGuildStore.getState().upsertChannel(updated);
    queryClient.setQueryData(['thread', threadId], updated);
    if (thread.parent_id) void queryClient.invalidateQueries({ queryKey: ['channel', thread.parent_id, 'threads'] });
  };
  const entries: MenuEntry[] = [
    thread.is_thread_member
      ? { kind: 'item', label: 'Leave thread', onSelect: () => void (async () => {
      const left = await attempt(async () => { await getRuntime().api.leaveThread(threadId); return true; }, 'Could not leave thread');
      if (left) useUiStore.getState().setSidePanel({ kind: 'threads' });
    })() }
      : { kind: 'item', label: 'Join thread', disabled: thread.is_thread_member === undefined, onSelect: () => void (async () => {
        const joined = await attempt(async () => { await getRuntime().api.joinThread(threadId); return true; }, 'Could not join thread');
        if (joined) void queryClient.invalidateQueries({ queryKey: ['thread', threadId] });
      })() },
  ];
  if (metadata && mayArchive) entries.push({ kind: 'item', label: metadata.archived ? 'Unarchive thread' : 'Archive thread', disabled: metadata.locked && !manages, onSelect: () => void update({ archived: !metadata.archived }) });
  if (metadata && manages) entries.push({ kind: 'item', label: metadata.locked ? 'Unlock thread' : 'Lock thread', onSelect: () => void update({ locked: !metadata.locked }) });
  return (
    <div className="thread-panel">
      <div className="thread-title"><span>{thread.name}</span><span className="thread-actions"><NotificationBell channel={thread} /><IconButton label="Thread actions" aria-haspopup="menu" aria-expanded={menu.open} onClick={menu.openBelow}><DotsThree size={20} /></IconButton></span></div>
      <Menu open={menu.open} x={menu.anchor?.x ?? 0} y={menu.anchor?.y ?? 0} entries={entries} onClose={menu.close} />
      <MessageList channelId={threadId} />
      {metadata?.archived ? <p className="panel-note">This thread is archived.</p> : <Composer channel={thread} mode={getRuntime().privacy.sender.resolveMode(thread)} />}
    </div>
  );
}
