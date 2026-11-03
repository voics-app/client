import { Plus, UsersThree, LockKey, Plugs } from '@phosphor-icons/react';
import { useMemo, useRef } from 'react';
import { useClosedDmStore } from '@renderer/application/stores/closedDmStore';
import { useNotificationSettingsStore } from '@renderer/application/stores/notificationSettingsStore';
import { buildDmMenu, visibleDms } from '@renderer/domain/dmModel';
import { DM_SCOPE, isChannelMuted, MUTE_DURATIONS } from '@renderer/domain/notificationSettings';
import { useGuildStore } from '@renderer/application/stores/guildStore';
import { usePresenceStore, useReadStateStore, useRelationshipStore } from '@renderer/application/stores/peopleStores';
import { useUiStore } from '@renderer/application/stores/uiStore';
import { ChannelType, RelationshipType, type Activity, type Channel, type PresenceStatus } from '@shared/contracts/rest';
import { isUnread } from '@renderer/domain/unread';
import { markChannelRead } from '../../app/actions';
import { muteChannel } from '../../app/notificationActions';
import { closeDm, leaveGroupDm } from '../../app/dmActions';
import { openChannel } from '../../app/navigation';
import { displayName } from '../../shared/hooks/useNames';
import { StatusLine } from '../members/StatusLine';
import { Avatar } from '../../shared/ui/Avatar';
import { IconButton } from '../../shared/ui/IconButton';
import { Count } from '../../shared/ui/Misc';
import { Menu, useMenu } from '../../shared/ui/Menu';
import { toMenuEntries } from '../../shared/ui/menuAdapter';
import { useRovingFocus } from '../../shared/hooks/useRovingFocus';

/** One DM row with its context menu: mark as read, profile, group settings, mute, close, leave. */
function DmRow({ channel: c, name, unread, mentions, active, status, activities }: { channel: Channel; name: string; unread: boolean; mentions: number; active: boolean; status: PresenceStatus | null; activities?: Activity[] }) {
  const menu = useMenu();
  const openDialog = useUiStore((s) => s.openDialog);
  const muted = useNotificationSettingsStore((s) => isChannelMuted(s.byScope[DM_SCOPE], c.id, Date.now()));
  const group = c.type === ChannelType.GROUP_DM;
  const peer = group ? undefined : (c.recipients ?? [])[0];
  const model = buildDmMenu({ group, hasUnread: unread || mentions > 0, muted, hasPeer: Boolean(peer) });
  const entries = toMenuEntries(model, (it) => {
    switch (it.id) {
      case 'markRead': return markChannelRead(c.id);
      case 'profile': return peer ? openDialog({ kind: 'profile', userId: peer.id, guildId: null }) : undefined;
      case 'settings': return openDialog({ kind: 'groupDm', channelId: c.id });
      case 'unmute': return void muteChannel(null, c.id, undefined);
      case 'muteFor': return void muteChannel(null, c.id, MUTE_DURATIONS.find((d) => d.id === it.arg)?.seconds ?? null);
      case 'close': return closeDm(c.id);
      case 'leave':
        return openDialog({ kind: 'confirm', title: `Leave ${name}?`, body: 'You will stop receiving messages from this group.', confirmLabel: 'Leave group', danger: true, onConfirm: () => leaveGroupDm(c.id) });
    }
  });
  return (
    <li onContextMenu={menu.openAt}>
      <button type="button" className={`dm-row${active ? ' is-active' : ''}${unread ? ' is-unread' : ''}`} onClick={() => openChannel(c.id)} aria-current={active || undefined}>
        {peer ? <Avatar id={peer.id} name={name} avatar={peer.avatar} size={34} status={status} /> : <Avatar id={c.id} name={name} avatar={c.icon ?? null} size={34} kind="channel-icons" />}
        <span className="dm-copy">
          <span className="dm-name">{name}</span>
          <StatusLine className="dm-status" activities={activities} max={60} />
        </span>
        {c.delivery_mode === 'ephemeral' && <LockKey size={13} weight="fill" className="channel-mode mode-ephemeral" aria-label="Ephemeral E2EE" />}
        {c.delivery_mode === 'p2p' && <Plugs size={13} weight="fill" className="channel-mode mode-p2p" aria-label="Peer-to-peer" />}
        <Count value={mentions} tone="danger" />
      </button>
      <Menu open={menu.open} x={menu.anchor?.x ?? 0} y={menu.anchor?.y ?? 0} entries={entries} onClose={menu.close} />
    </li>
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
  const closed = useClosedDmStore((s) => s.closed);
  const dms = useMemo(() => visibleDms(channels, closed), [channels, closed]);
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
            const status = c.type === ChannelType.DM && peers[0] ? (presence[peers[0].id]?.status ?? 'offline') : null;
            return <DmRow key={c.id} channel={c} name={name} unread={unread} mentions={read?.mentionCount ?? 0} active={active} status={status} activities={c.type === ChannelType.DM && peers[0] ? presence[peers[0].id]?.activities : undefined} />;
          })}
          {dms.length === 0 && <li className="sidebar-empty">No conversations yet. Start one with the plus button.</li>}
        </ul>
      </div>
    </aside>
  );
}
