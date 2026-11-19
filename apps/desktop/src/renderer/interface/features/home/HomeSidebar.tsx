import { Plus, UsersThree, LockKey, Plugs, PushPin, ListChecks, X } from '@phosphor-icons/react';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useClosedDmStore } from '@discordy/core/application/stores/closedDmStore';
import { useNotificationSettingsStore } from '@discordy/core/application/stores/notificationSettingsStore';
import { buildDmMenu, visibleDms } from '@discordy/core/domain/dmModel';
import { DM_SCOPE, isChannelMuted, MUTE_DURATIONS } from '@discordy/core/domain/notificationSettings';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { typingUsers, useTypingStore, usePresenceStore, useReadStateStore, useRelationshipStore, useFavouriteFriendsStore } from '@discordy/core/application/stores/peopleStores';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import { ChannelType, RelationshipType, type Activity, type Channel, type PresenceStatus } from '@discordy/core/contracts/rest';
import { bulkLeaveConfirmation, pruneSelection, selectableGroupIds, toggleSelected } from '@discordy/core/domain/groupDmSelection';
import { isUnread } from '@discordy/core/domain/unread';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { isPinFull, MAX_PINNED_DMS, orderPinnedFirst } from '@discordy/core/domain/pins';
import { getRuntime } from '../../app/runtime';
import { markChannelRead } from '../../app/actions';
import { muteChannel } from '../../app/notificationActions';
import { closeDm, leaveGroupDm, leaveGroupDms } from '../../app/dmActions';
import { setDmPinned } from '../../app/pinActions';
import { openChannel } from '../../app/navigation';
import { displayName } from '../../shared/hooks/useNames';
import { StatusLine } from '../members/StatusLine';
import { Button } from '../../shared/ui/Button';
import { Avatar } from '../../shared/ui/Avatar';
import { IconButton } from '../../shared/ui/IconButton';
import { Count } from '../../shared/ui/Misc';
import { Menu, useMenu } from '../../shared/ui/Menu';
import { toMenuEntries } from '../../shared/ui/menuAdapter';
import { useRovingFocus } from '../../shared/hooks/useRovingFocus';
import { useNow } from '../../shared/hooks/useNow';

/** Selection mode of the DM list: ticking is only offered for group DMs, 1:1 rows are shown dimmed and inert. */
interface Selection { selected: boolean; onToggle: () => void }

/** One DM row with its context menu: mark as read, profile, group settings, mute, close, leave. */
function DmRow({ channel: c, name, unread, mentions, active, status, activities, pinned, pinFull, selection }: { channel: Channel; name: string; unread: boolean; mentions: number; active: boolean; status: PresenceStatus | null; activities?: Activity[]; pinned: boolean; pinFull: boolean; selection?: Selection }) {
  const menu = useMenu();
  const openDialog = useUiStore((s) => s.openDialog);
  const muted = useNotificationSettingsStore((s) => isChannelMuted(s.byScope[DM_SCOPE], c.id, Date.now()));
  const typing = useTypingStore((s) => s.byChannel);
  const me = useSessionStore((s) => s.user?.id ?? null);
  const now = useNow(1500);
  const isTyping = typingUsers(typing, c.id, me, now).length > 0;
  const group = c.type === ChannelType.GROUP_DM;
  const peer = group ? undefined : (c.recipients ?? [])[0];
  const model = buildDmMenu({ group, hasUnread: unread || mentions > 0, muted, hasPeer: Boolean(peer), pinned, pinFull });
  const entries = toMenuEntries(model, (it) => {
    switch (it.id) {
      case 'markRead': return markChannelRead(c.id);
      case 'pin': return void setDmPinned(c.id, true);
      case 'unpin': return void setDmPinned(c.id, false);
      case 'profile': return peer ? openDialog({ kind: 'profile', userId: peer.id, guildId: null }) : undefined;
      case 'settings': return openDialog({ kind: 'groupDm', channelId: c.id });
      case 'unmute': return void muteChannel(null, c.id, undefined);
      case 'muteFor': return void muteChannel(null, c.id, MUTE_DURATIONS.find((d) => d.id === it.arg)?.seconds ?? null);
      case 'close': return closeDm(c.id);
      case 'leave':
        return openDialog({ kind: 'confirm', title: `Leave ${name}?`, body: 'You will stop receiving messages from this group.', confirmLabel: 'Leave group', danger: true, onConfirm: () => leaveGroupDm(c.id) });
    }
  });
  const copy = (
    <>
      {peer ? <Avatar id={peer.id} name={name} avatar={peer.avatar} size={34} status={status} /> : <Avatar id={c.id} name={name} avatar={c.icon ?? null} size={34} kind="channel-icons" />}
      <span className="dm-copy">
        <span className="dm-name">{name}</span>
        {isTyping ? <span className="dm-status dm-typing" role="status" aria-label={`${name} is typing`}><span className="typing-dots" aria-hidden="true"><i /><i /><i /></span> Typing…</span> : <StatusLine className="dm-status" activities={activities} max={60} />}
      </span>
    </>
  );
  if (selection) {
    return (
      <li>
        {group ? (
          <label className={`dm-row is-selecting${selection.selected ? ' is-selected' : ''}`}>
            <span className="checkbox">
              <input type="checkbox" checked={selection.selected} onChange={selection.onToggle} aria-label={`Select ${name}`} />
              <span className="checkbox-box" aria-hidden="true" />
            </span>
            {copy}
          </label>
        ) : (
          <div className="dm-row is-selecting is-inert" aria-disabled="true" title="Only group DMs can be left in bulk">{copy}</div>
        )}
      </li>
    );
  }
  return (
    <li className="dm-list-item" onContextMenu={menu.openAt}>
      <button type="button" className={`dm-row${active ? ' is-active' : ''}${unread ? ' is-unread' : ''}`} onClick={() => openChannel(c.id)} aria-current={active || undefined}>
        {copy}
        {pinned && <PushPin size={13} weight="fill" className="dm-pin" aria-label="Pinned" />}
        {c.delivery_mode === 'ephemeral' && <LockKey size={13} weight="fill" className="channel-mode mode-ephemeral" aria-label="Ephemeral E2EE" />}
        {c.delivery_mode === 'p2p' && <Plugs size={13} weight="fill" className="channel-mode mode-p2p" aria-label="Peer-to-peer" />}
        <Count value={mentions} tone="danger" />
      </button>
      <button type="button" className="dm-close" aria-label={`Close conversation with ${name}`} onClick={() => closeDm(c.id)}><X size={16} /></button>
      <Menu open={menu.open} x={menu.anchor?.x ?? 0} y={menu.anchor?.y ?? 0} entries={entries} onClose={menu.close} />
    </li>
  );
}

export function HomeSidebar() {
  const channels = useGuildStore((s) => s.channels);
  const favouriteIds = useFavouriteFriendsStore((s) => s.ids);
  const relationships = useRelationshipStore((s) => s.byUser);
  useEffect(() => {
    let active = true;
    useFavouriteFriendsStore.getState().set([]);
    const initial = useFavouriteFriendsStore.getState().ids;
    void Promise.resolve().then(() => getRuntime().api.favouriteFriends()).then((ids) => {
      if (active && useFavouriteFriendsStore.getState().ids === initial) useFavouriteFriendsStore.getState().set(ids);
    }).catch(() => {
      if (active) useUiStore.getState().toast({ tone: 'danger', title: 'Could not load favourites' });
    });
    return () => { active = false; useFavouriteFriendsStore.getState().set([]); };
  }, []);
  const reads = useReadStateStore((s) => s.byChannel);
  const presence = usePresenceStore((s) => s.byUser);
  const view = useUiStore((s) => s.view);
  const navigate = useUiStore((s) => s.navigate);
  const openDialog = useUiStore((s) => s.openDialog);
  const pending = useRelationshipStore((s) => Object.values(s.byUser).filter((r) => r.type === RelationshipType.INCOMING).length);
  const closed = useClosedDmStore((s) => s.closed);
  const pins = useSessionStore((s) => s.settings.pinned_dm_channel_ids);
  const pinIds = useMemo(() => pins ?? [], [pins]);
  const dms = useMemo(() => {
    const { pinned, rest } = orderPinnedFirst(visibleDms(channels, closed), pinIds);
    return [...pinned, ...rest];
  }, [channels, closed, pinIds]);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const selectable = useMemo(() => selectableGroupIds(dms), [dms]);
  const ticked = useMemo(() => pruneSelection(selected, selectable), [selected, selectable]);
  const stopSelecting = () => { setSelecting(false); setSelected([]); };
  const confirmLeave = () => {
    const names: Record<string, string> = {};
    for (const c of dms) names[c.id] = c.name || (c.recipients ?? []).map((u) => displayName(u)).join(', ') || 'Unknown';
    openDialog({ kind: 'confirm', ...bulkLeaveConfirmation(ticked.length), danger: true, onConfirm: async () => { await leaveGroupDms(ticked, names); stopSelecting(); } });
  };
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
          <span className="category-actions">
            {selectable.length > 0 && <IconButton label={selecting ? 'Cancel selection' : 'Select group DMs'} size="sm" onClick={selecting ? stopSelecting : () => setSelecting(true)}><ListChecks size={14} weight={selecting ? 'fill' : 'regular'} /></IconButton>}
            <IconButton label="New message" size="sm" onClick={() => openDialog({ kind: 'newDm' })}><Plus size={14} /></IconButton>
          </span>
        </header>
        <ul className="dm-list">
          {dms.some((c) => c.type === ChannelType.DM && (c.recipients ?? []).some((u) => favouriteIds.includes(u.id) && relationships[u.id]?.type === RelationshipType.FRIEND)) && <li className="category-head is-static">Favourites</li>}
          {[...dms.filter((c) => c.type === ChannelType.DM && (c.recipients ?? []).some((u) => favouriteIds.includes(u.id) && relationships[u.id]?.type === RelationshipType.FRIEND)), ...dms.filter((c) => c.type !== ChannelType.DM || !(c.recipients ?? []).some((u) => favouriteIds.includes(u.id) && relationships[u.id]?.type === RelationshipType.FRIEND))].map((c, index) => {
            const peers = c.recipients ?? [];
            const name = c.name || peers.map((u) => displayName(u)).join(', ') || 'Unknown';
            const read = reads[c.id];
            const unread = isUnread(c.last_message_id, read?.lastReadId);
            const active = view.channelId === c.id;
            const status = c.type === ChannelType.DM && peers[0] ? (presence[peers[0].id]?.status ?? 'offline') : null;
            const isFavourite = c.type === ChannelType.DM && peers.some((u) => favouriteIds.includes(u.id) && relationships[u.id]?.type === RelationshipType.FRIEND);
            const before = index > 0 && dms.some((d) => d.type === ChannelType.DM && (d.recipients ?? []).some((u) => favouriteIds.includes(u.id) && relationships[u.id]?.type === RelationshipType.FRIEND)) && !isFavourite && index === dms.filter((d) => d.type === ChannelType.DM && (d.recipients ?? []).some((u) => favouriteIds.includes(u.id) && relationships[u.id]?.type === RelationshipType.FRIEND)).length;
            return <Fragment key={c.id}>{before && <li className="category-head is-static">Direct messages</li>}<DmRow key={c.id} channel={c} name={name} unread={unread} mentions={read?.mentionCount ?? 0} active={active} pinned={pinIds.includes(c.id)} pinFull={isPinFull(pinIds, c.id, MAX_PINNED_DMS)} status={status} selection={selecting ? { selected: ticked.includes(c.id), onToggle: () => setSelected(toggleSelected(ticked, c.id)) } : undefined} activities={c.type === ChannelType.DM && peers[0] ? presence[peers[0].id]?.activities : undefined} /></Fragment>;
          })}
          {dms.length === 0 && <li className="sidebar-empty">No conversations yet. Start one with the plus button.</li>}
        </ul>
      </div>
      {selecting && (
        <div className="dm-select-bar">
          <Button variant="ghost" size="sm" onClick={stopSelecting}>Cancel</Button>
          <Button variant="danger" size="sm" disabled={ticked.length === 0} onClick={confirmLeave}>{ticked.length === 0 ? 'Leave' : `Leave ${ticked.length}`}</Button>
        </div>
      )}
    </aside>
  );
}
