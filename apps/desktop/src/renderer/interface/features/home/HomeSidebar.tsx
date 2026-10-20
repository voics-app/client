import { At, Plus, UsersThree, LockKey, Plugs } from '@phosphor-icons/react';
import { useMemo, useRef, type ReactNode } from 'react';
import { useGuildStore } from '@renderer/application/stores/guildStore';
import { usePresenceStore, useReadStateStore, useRelationshipStore } from '@renderer/application/stores/peopleStores';
import { useUiStore } from '@renderer/application/stores/uiStore';
import { ChannelType, RelationshipType, type User } from '@shared/contracts/rest';
import { timestampOf } from '@renderer/domain/snowflake';
import { isUnread } from '@renderer/domain/unread';
import { openChannel } from '../../app/navigation';
import { displayName } from '../../shared/hooks/useNames';
import { Avatar } from '../../shared/ui/Avatar';
import { IconButton } from '../../shared/ui/IconButton';
import { Count } from '../../shared/ui/Misc';
import { UserMenuTarget } from '../members/UserContextMenu';
import { useRovingFocus } from '../../shared/hooks/useRovingFocus';

function DmMenu({ peer, name, children }: { peer: User | undefined; name: string; children: ReactNode }) {
  if (!peer) return <>{children}</>;
  return (
    <UserMenuTarget userId={peer.id} name={name} guildId={null} user={peer}>
      {children}
    </UserMenuTarget>
  );
}

export function HomeSidebar() {
  const channels = useGuildStore((s) => s.channels);
  const reads = useReadStateStore((s) => s.byChannel);
  const presence = usePresenceStore((s) => s.byUser);
  const view = useUiStore((s) => s.view);
  const navigate = useUiStore((s) => s.navigate);
  const openDialog = useUiStore((s) => s.openDialog);
  const pending = useRelationshipStore((s) => Object.values(s.byUser).filter((r) => r.type === RelationshipType.INCOMING).length);
  const dms = useMemo(
    () =>
      Object.values(channels)
        .filter((c) => !c.guild_id && (c.type === ChannelType.DM || c.type === ChannelType.GROUP_DM))
        .sort((a, b) => (b.last_message_id ? timestampOf(b.last_message_id) : 0) - (a.last_message_id ? timestampOf(a.last_message_id) : 0)),
    [channels],
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  useRovingFocus(scrollRef, { selector: '.nav-row, .dm-row' });
  const friendsActive = view.kind === 'home' && !view.channelId;

  return (
    <aside className="sidebar" aria-label="Direct messages">
      <div className="sidebar-top">
        <button type="button" className="palette-pill is-sidebar" onClick={() => useUiStore.getState().openPalette(true)}>Find or start a conversation</button>
      </div>
      <div ref={scrollRef} className="sidebar-scroll">
        <button type="button" className={`nav-row${friendsActive ? ' is-active' : ''}`} onClick={() => navigate({ kind: 'home', channelId: null })} aria-current={friendsActive || undefined}>
          <UsersThree size={22} weight={friendsActive ? 'fill' : 'regular'} /> <span>Friends</span> <Count value={pending} tone="danger" />
        </button>
        <header className="category-head is-static">
          <span>Direct messages</span>
          <IconButton label="New message" size="sm" onClick={() => openDialog({ kind: 'newDm' })}><Plus size={14} /></IconButton>
        </header>
        <ul className="dm-list">
          {dms.map((c) => {
            const peers = c.recipients ?? [];
            const name = c.name || peers.map((u) => displayName(u)).join(', ') || 'Unknown';
            const read = reads[c.id];
            const unread = isUnread(c.last_message_id, read?.lastReadId);
            const active = view.channelId === c.id;
            const first = peers[0];
            return (
              <li key={c.id}>
                <DmMenu peer={peers.length === 1 ? first : undefined} name={name}>
                <button type="button" className={`dm-row${active ? ' is-active' : ''}${unread ? ' is-unread' : ''}`} onClick={() => openChannel(c.id)} aria-current={active || undefined}>
                  {peers.length === 1 && first ? <Avatar id={first.id} name={name} avatar={first.avatar} size={34} status={presence[first.id]?.status ?? 'offline'} /> : <span className="group-avatar"><At size={18} /></span>}
                  <span className="dm-name">{name}</span>
                  {c.delivery_mode === 'ephemeral' && <LockKey size={13} weight="fill" className="channel-mode mode-ephemeral" aria-label="Ephemeral E2EE" />}
                  {c.delivery_mode === 'p2p' && <Plugs size={13} weight="fill" className="channel-mode mode-p2p" aria-label="Peer-to-peer" />}
                  <Count value={read?.mentionCount ?? 0} tone="danger" />
                </button>
                </DmMenu>
              </li>
            );
          })}
          {dms.length === 0 && <li className="sidebar-empty">No conversations yet. Start one with the plus button.</li>}
        </ul>
      </div>
    </aside>
  );
}
