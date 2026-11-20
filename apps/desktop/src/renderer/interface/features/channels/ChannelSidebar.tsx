import { Broadcast, CaretDown, CaretRight, ChatsCircle, Gear, Hash, LockKey, LockSimple, Megaphone, MicrophoneSlash, Plugs, Plus, PushPin, SpeakerHigh, SpeakerSlash, UserPlus, VideoCamera } from '@phosphor-icons/react';
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useReadStateStore } from '@discordy/core/application/stores/peopleStores';
import { usePrefsStore } from '@discordy/core/application/stores/prefsStore';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import { useVoiceStore, usersInChannel } from '@discordy/core/application/stores/voiceStore';
import { isUnread } from '@discordy/core/domain/unread';
import { orderPinnedFirst, pinnedChannelsOf } from '@discordy/core/domain/pins';
import { LOOSE, layoutOf, resolveDrop, type ChannelDrag, type ChannelDropZone } from '@discordy/core/domain/channelOrder';
import { isPrivateChannel, offscreenMentions, visibleChannelIds, type ActivityFacts } from '@discordy/core/domain/channelActivity';
import { isChannelMutedDeep, scopeKey } from '@discordy/core/domain/notificationSettings';
import { useNotificationSettingsStore } from '@discordy/core/application/stores/notificationSettingsStore';
import { DEAF_LABEL, MUTE_LABEL, canDragOccupant, canDropOccupant, channelCapacity, occupantFlags } from '@discordy/core/domain/voiceOccupant';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { Permission } from '@discordy/core/contracts/permissions';
import { ChannelType, type Channel, type VoiceState } from '@discordy/core/contracts/rest';
import { channelIcon, openChannel } from '../../app/navigation';
import { openVoiceChannel } from '../../app/voiceActions';
import { markChannelRead } from '../../app/actions';
import { applyChannelLayout, guildChannels } from '../../app/channelOrderActions';
import { can, useChannelPermissions, useGuildPermissions } from '../../shared/hooks/usePermissions';
import { displayName } from '../../shared/hooks/useNames';
import { Avatar } from '../../shared/ui/Avatar';
import { IconButton } from '../../shared/ui/IconButton';
import { Count } from '../../shared/ui/Misc';
import { Menu, useMenu } from '../../shared/ui/Menu';
import { useRovingFocus } from '../../shared/hooks/useRovingFocus';
import { moveMember, useUserMenu } from '../members/UserContextMenu';
import { openVoiceChat, voiceTextChatEnabled } from '../voice/VoiceTextChat';
import { GuildHeader } from './GuildHeader';
import { CategoryContextMenuEntries, ChannelContextMenuEntries } from './channelMenu';

interface ChannelDnd {
  enabled: boolean;
  drag: ChannelDrag | null;
  hover: { key: string; zone: ChannelDropZone } | null;
  begin(item: ChannelDrag): void;
  end(): void;
  over(key: string, target: ChannelDrag, zone: ChannelDropZone): void;
  drop(): void;
}

const dropKey = (item: ChannelDrag) => `${item.kind}:${item.id}`;
const hoverClass = (dnd: ChannelDnd, key: string) => (dnd.hover?.key === key ? ` drop-${dnd.hover.zone}` : '');

function useChannelDnd(guildId: string, enabled: boolean): ChannelDnd {
  const [drag, setDrag] = useState<ChannelDrag | null>(null);
  const [state, setState] = useState<{ key: string; zone: ChannelDropZone; target: ChannelDrag } | null>(null);
  const end = () => {
    setDrag(null);
    setState(null);
  };
  return {
    enabled,
    drag,
    hover: state,
    begin: setDrag,
    end,
    over: (key, target, zone) => setState((h) => (h?.key === key && h.zone === zone ? h : { key, zone, target })),
    drop: () => {
      if (drag && state) {
        const layout = resolveDrop(layoutOf(guildChannels(guildId)), drag, state.target, state.zone);
        void applyChannelLayout(guildId, layout, drag.kind === 'channel' ? drag.id : undefined);
      }
      end();
    },
  };
}

const halfOf = (event: React.DragEvent, el: Element): 'before' | 'after' => {
  const rect = el.getBoundingClientRect();
  return event.clientY - rect.top < rect.height / 2 ? 'before' : 'after';
};

const ICONS = { text: Hash, voice: SpeakerHigh, announcement: Megaphone, forum: ChatsCircle, stage: SpeakerHigh, thread: Hash };

/** The occupant being dragged, shared with the channel rows that accept the drop. */
let draggedOccupant: VoiceState | null = null;

export function VoiceOccupant({ guildId, state, speaking }: { guildId: string | null; state: VoiceState; speaking: number }) {
  const member = useGuildStore((s) => (guildId ? s.members[guildId]?.[state.user_id] : undefined)) ?? state.member;
  const user = member?.user;
  const name = user ? displayName(user, member?.nick) : state.user_id;
  const openDialog = useUiStore((s) => s.openDialog);
  const me = useSessionStore((s) => s.user?.id);
  const perms = useGuildPermissions(guildId);
  const draggable = Boolean(guildId) && canDragOccupant(perms, state, me);
  const { bind, node } = useUserMenu({ userId: state.user_id, name, guildId, user });
  const flags = occupantFlags(state);
  return (
    <li
      className={`occupant${speaking > 0.05 ? ' is-speaking' : ''}`}
      {...bind}
      draggable={draggable}
      onDragStart={(e) => {
        if (!draggable) return;
        e.stopPropagation();
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', name);
        draggedOccupant = state;
      }}
      onDragEnd={() => {
        draggedOccupant = null;
      }}
      onClick={(e) => {
        // The user menu and its panels are portals inside this <li>: their clicks bubble through React but are not ours.
        if (!e.currentTarget.contains(e.target as Node)) return;
        openDialog({ kind: 'profile', userId: state.user_id, guildId });
      }}
    >
      <Avatar id={state.user_id} name={name} avatar={user?.avatar} size={22} speaking={speaking} />
      <span className="occupant-name">{name}</span>
      <span className="occupant-flags">
        {flags.mute && <MicrophoneSlash size={14} weight="fill" className={`occupant-flag is-${flags.mute}`} aria-label={MUTE_LABEL[flags.mute]} />}
        {flags.deaf && <SpeakerSlash size={14} weight="fill" className={`occupant-flag is-${flags.deaf}`} aria-label={DEAF_LABEL[flags.deaf]} />}
        {flags.camera && <VideoCamera size={14} weight="fill" className="occupant-flag" aria-label="Camera on" />}
        {flags.live && (
          <span className="occupant-live" title="Streaming">
            <Broadcast size={10} weight="bold" /> LIVE
          </span>
        )}
      </span>
      {node}
    </li>
  );
}

function ChannelRow({ channel, active, dnd, pinned = false }: { channel: Channel; active: boolean; dnd: ChannelDnd; pinned?: boolean }) {
  const read = useReadStateStore((s) => s.byChannel[channel.id]);
  const settings = useNotificationSettingsStore((s) => s.byScope[scopeKey(channel.guild_id)]);
  const muted = isChannelMutedDeep(settings, channel, Date.now());
  const perms = useChannelPermissions(channel.id);
  const speaking = useVoiceStore((s) => s.speaking);
  const voiceStates = useVoiceStore((s) => s.states);
  const menu = useMenu();
  const openDialog = useUiStore((s) => s.openDialog);
  const openSettings = useUiStore((s) => s.openSettings);
  const navigate = useUiStore((s) => s.navigate);
  const kind = channelIcon(channel.type);
  const Icon = ICONS[kind];
  const isVoice = kind === 'voice' || kind === 'stage';
  const unread = !muted && !isVoice && isUnread(channel.last_message_id, read?.lastReadId);
  const occupants = isVoice ? usersInChannel(voiceStates, channel.guild_id, channel.id) : [];
  const mentions = read?.mentionCount ?? 0;
  const me = useSessionStore((s) => s.user?.id);
  const guildPerms = useGuildPermissions(channel.guild_id);
  const canMove = can(perms, Permission.MOVE_MEMBERS);
  const capacity = isVoice ? channelCapacity(channel.user_limit, occupants.length, canMove) : null;
  const [moveHover, setMoveHover] = useState(false);
  const chatShown = isVoice && voiceTextChatEnabled(channel);
  const entries = ChannelContextMenuEntries(channel, perms, { openDialog, openSettings, markRead: () => markChannelRead(channel.id), hasUnread: unread || mentions > 0 });

  if (!can(perms, Permission.VIEW_CHANNEL)) return null;

  const select = () => {
    if (kind === 'stage' && channel.guild_id) { navigate({ kind: 'guild', guildId: channel.guild_id, channelId: channel.id }); return; }
    if (capacity?.joinBlocked && !occupants.some((o) => o.user_id === me)) return;
    if (isVoice) void openVoiceChannel(channel.guild_id ?? null, channel.id);
    else if (channel.guild_id) navigate({ kind: 'guild', guildId: channel.guild_id, channelId: channel.id });
    else openChannel(channel.id);
  };

  return (
    <li data-channel-id={channel.id} data-attention={mentions > 0 ? 'mention' : unread ? 'unread' : undefined} className={(hoverClass(dnd, dropKey({ kind: 'channel', id: channel.id })).trim() + (moveHover ? ' is-move-target' : '')).trim() || undefined}
      onDragOver={(e) => {
        if (kind === 'stage' || !isVoice || !draggedOccupant || !canDropOccupant(draggedOccupant, channel)) return;
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
        setMoveHover(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setMoveHover(false);
      }}
      onDrop={(e) => {
        setMoveHover(false);
        const dragged = draggedOccupant;
        if (kind === 'stage' || !isVoice || !dragged || !canDropOccupant(dragged, channel) || !channel.guild_id || !can(guildPerms, Permission.MOVE_MEMBERS)) return;
        e.preventDefault();
        e.stopPropagation();
        draggedOccupant = null;
        void moveMember(channel.guild_id, dragged.user_id, channel.id);
      }}
    >
      <div
        className={`channel-row${active ? ' is-active' : ''}${unread ? ' is-unread' : ''}${muted ? ' is-muted' : ''}${dnd.drag?.id === channel.id ? ' is-dragging' : ''}`}
        onContextMenu={menu.openAt}
        draggable={dnd.enabled}
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move';
          dnd.begin({ kind: 'channel', id: channel.id });
        }}
        onDragEnd={dnd.end}
      >
        <button type="button" className="channel-main" onClick={select} aria-current={active || undefined} aria-disabled={capacity?.joinBlocked || undefined} title={capacity?.joinBlocked ? 'Channel is full' : undefined}>
          {unread && <span className="channel-unread-dot" aria-label="Unread" />}
          <Icon size={18} className="channel-icon" weight={active ? 'fill' : 'regular'} />
          <span className="channel-name">{channel.name}</span>
          {pinned && <PushPin size={12} weight="fill" className="channel-pin" aria-label="Pinned" />}
          {isPrivateChannel(channel) && <LockSimple size={12} weight="fill" className="channel-lock" aria-label="Private channel" />}
          {channel.nsfw && <span className="channel-nsfw" title="Age-restricted" aria-label="Age-restricted">18+</span>}
          {channel.delivery_mode === 'ephemeral' && <LockKey size={13} weight="fill" className="channel-mode mode-ephemeral" aria-label="Ephemeral E2EE" />}
          {channel.delivery_mode === 'p2p' && <Plugs size={13} weight="fill" className="channel-mode mode-p2p" aria-label="Peer-to-peer" />}
          {capacity?.label && (
            <span className={`channel-capacity tnum${capacity.full ? ' is-full' : ''}`} title={capacity.joinBlocked ? 'Channel is full' : `User limit ${channel.user_limit}`}>
              {capacity.full && <LockSimple size={11} weight="fill" aria-label="Full" />}
              {capacity.label}
            </span>
          )}
          <Count value={mentions} tone="danger" />
        </button>
        {(chatShown || (channel.guild_id && (can(perms, Permission.CREATE_INSTANT_INVITE) || can(perms, Permission.MANAGE_CHANNELS)))) && (
          <span className="channel-actions">
            {chatShown && (
              <IconButton
                label="Open chat"
                size="sm"
                onClick={() => {
                  if (channel.guild_id) navigate({ kind: 'guild', guildId: channel.guild_id, channelId: channel.id });
                  else openChannel(channel.id);
                  openVoiceChat(channel.id);
                }}
              >
                <ChatsCircle size={15} />
              </IconButton>
            )}
            {channel.guild_id && can(perms, Permission.CREATE_INSTANT_INVITE) && (
              <IconButton label="Create invite" size="sm" onClick={() => openDialog({ kind: 'invite', guildId: channel.guild_id!, channelId: channel.id })}>
                <UserPlus size={15} />
              </IconButton>
            )}
            {channel.guild_id && can(perms, Permission.MANAGE_CHANNELS) && (
              <IconButton label="Edit channel" size="sm" onClick={() => openSettings({ kind: 'channel', channelId: channel.id, tab: 'overview' })}>
                <Gear size={15} />
              </IconButton>
            )}
          </span>
        )}
      </div>
      {occupants.length > 0 && (
        <ul className="voice-occupants">
          {occupants.map((v) => (
            <VoiceOccupant key={v.user_id} guildId={channel.guild_id ?? null} state={v} speaking={speaking[v.user_id] ?? 0} />
          ))}
        </ul>
      )}
      <Menu open={menu.open} x={menu.anchor?.x ?? 0} y={menu.anchor?.y ?? 0} entries={entries} onClose={menu.close} />
    </li>
  );
}

function Category({ category, children, guildId, siblings, dnd }: { category: Channel | null; children: Channel[]; guildId: string; siblings: string[]; dnd: ChannelDnd }) {
  const collapsed = usePrefsStore((s) => (category ? s.collapsedCategories[category.id] : false));
  const toggle = usePrefsStore((s) => s.toggleMap);
  const settings = useNotificationSettingsStore((s) => s.byScope[scopeKey(guildId)]);
  const reads = useReadStateStore((s) => s.byChannel);
  const voiceStates = useVoiceStore((s) => s.states);
  const openDialog = useUiStore((s) => s.openDialog);
  const openSettings = useUiStore((s) => s.openSettings);
  const perms = useGuildPermissions(guildId);
  const view = useUiStore((s) => s.view);
  const menu = useMenu();
  const activeId = view.channelId;
  const facts = useMemo<ActivityFacts[]>(() => {
    const now = Date.now();
    return children.map((c) => {
      const kind = channelIcon(c.type);
      const isVoice = kind === 'voice' || kind === 'stage';
      const read = reads[c.id];
      return {
        id: c.id,
        muted: isChannelMutedDeep(settings, c, now),
        unread: !isVoice && isUnread(c.last_message_id, read?.lastReadId),
        mentions: read?.mentionCount ?? 0,
        occupied: isVoice && usersInChannel(voiceStates, c.guild_id, c.id).length > 0,
      };
    });
  }, [children, reads, settings, voiceStates]);
  const shown = visibleChannelIds(facts, Boolean(collapsed), activeId);
  const hideMuted = Boolean(settings?.hide_muted_channels);
  const visible = children.filter((c) => shown.has(c.id) && !(hideMuted && c.id !== activeId && facts.find((f) => f.id === c.id)?.muted));
  const hasUnread = facts.some((f) => (f.unread && !f.muted) || f.mentions > 0);
  const entries = category
    ? CategoryContextMenuEntries(category, children, siblings, perms, { guildId, openDialog, openSettings, hasUnread, markRead: () => children.forEach((c) => markChannelRead(c.id)) })
    : [];
  const sectionId = category?.id ?? LOOSE;
  const onDragOver = (event: React.DragEvent) => {
    const drag = dnd.drag;
    if (!dnd.enabled || !drag) return;
    const row = (event.target as HTMLElement).closest('li[data-channel-id]');
    const head = (event.target as HTMLElement).closest('.category-head');
    if (drag.kind === 'channel') {
      event.preventDefault();
      if (row) dnd.over(dropKey({ kind: 'channel', id: row.getAttribute('data-channel-id')! }), { kind: 'channel', id: row.getAttribute('data-channel-id')! }, halfOf(event, row));
      else dnd.over(dropKey({ kind: 'category', id: sectionId }), { kind: 'category', id: sectionId }, head ? 'start' : 'end');
    } else if (category) {
      event.preventDefault();
      dnd.over(dropKey({ kind: 'category', id: category.id }), { kind: 'category', id: category.id }, halfOf(event, event.currentTarget));
    }
  };
  return (
    <section
      className={`category${dnd.drag?.kind === 'category' && dnd.drag.id === category?.id ? ' is-dragging' : ''}${hoverClass(dnd, dropKey({ kind: 'category', id: sectionId }))}`}
      onDragOver={onDragOver}
      onDrop={(e) => {
        if (!dnd.drag) return;
        e.preventDefault();
        dnd.drop();
      }}
    >
      {category && (
        <header
          className="category-head"
          onContextMenu={menu.openAt}
          draggable={dnd.enabled}
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = 'move';
            dnd.begin({ kind: 'category', id: category.id });
          }}
          onDragEnd={dnd.end}
        >
          <button type="button" onClick={() => toggle('collapsedCategories', category.id)} aria-expanded={!collapsed}>
            {collapsed ? <CaretRight size={11} weight="bold" /> : <CaretDown size={11} weight="bold" />}
            <span>{category.name}</span>
          </button>
          {can(perms, Permission.MANAGE_CHANNELS) && (
            <IconButton label="Create channel" size="sm" onClick={() => openDialog({ kind: 'createChannel', guildId, parentId: category.id })}>
              <Plus size={14} />
            </IconButton>
          )}
          <Menu open={menu.open} x={menu.anchor?.x ?? 0} y={menu.anchor?.y ?? 0} entries={entries} onClose={menu.close} minWidth={220} />
        </header>
      )}
      <ul className="channel-list">
        {visible.map((c) => (
          <ChannelRow key={c.id} channel={c} active={c.id === activeId} dnd={dnd} />
        ))}
      </ul>
    </section>
  );
}

/** Floating pill shown when channels that need attention are scrolled out of the list. */
function AttentionPill({ scrollRef, version }: { scrollRef: RefObject<HTMLDivElement | null>; version: unknown }) {
  const [pill, setPill] = useState<{ above: string | null; below: string | null }>({ above: null, below: null });
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => {
      const box = el.getBoundingClientRect();
      const rows = [...el.querySelectorAll<HTMLElement>('li[data-attention]')].map((row) => {
        const r = row.getBoundingClientRect();
        return { id: row.dataset.channelId ?? '', top: r.top, bottom: r.bottom };
      });
      const next = offscreenMentions(rows, { top: box.top, bottom: box.bottom });
      setPill((p) => (p.above === next.above && p.below === next.below ? p : next));
    };
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    return () => {
      el.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
  }, [scrollRef, version]);

  const rowOf = (id: string) => scrollRef.current?.querySelector<HTMLElement>(`li[data-channel-id="${id}"]`);
  const go = (id: string) => rowOf(id)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  const label = (id: string) => (rowOf(id)?.dataset.attention === 'mention' ? 'New mentions' : 'New unreads');
  return (
    <>
      {pill.above && (
        <button type="button" className="mention-pill is-top" onClick={() => go(pill.above!)}>
          {label(pill.above)} above
        </button>
      )}
      {pill.below && (
        <button type="button" className="mention-pill is-bottom" onClick={() => go(pill.below!)}>
          {label(pill.below)} below
        </button>
      )}
    </>
  );
}

export function ChannelSidebar({ guildId }: { guildId: string }) {
  const channels = useGuildStore((s) => s.channels);
  const pins = useSessionStore((s) => s.settings.pinned_channel_ids);
  const { pinned, groups } = useMemo(() => {
    const listed = Object.values(channels)
      .filter((c) => c.guild_id === guildId && !(c.type >= 10 && c.type <= 12))
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.id.localeCompare(b.id));
    // Personal pins move to the Pinned section above the categories; categories themselves cannot be pinned.
    const split = orderPinnedFirst(listed.filter((c) => c.type !== ChannelType.GUILD_CATEGORY), pinnedChannelsOf(pins, guildId));
    const pinnedIds = new Set(split.pinned.map((c) => c.id));
    const inGuild = listed.filter((c) => !pinnedIds.has(c.id));
    const categories = inGuild.filter((c) => c.type === ChannelType.GUILD_CATEGORY);
    const loose = inGuild.filter((c) => c.type !== ChannelType.GUILD_CATEGORY && !c.parent_id);
    const result: { category: Channel | null; children: Channel[] }[] = [];
    if (loose.length > 0) result.push({ category: null, children: loose });
    for (const category of categories) result.push({ category, children: inGuild.filter((c) => c.parent_id === category.id && c.type !== ChannelType.GUILD_CATEGORY) });
    return { pinned: split.pinned, groups: result };
  }, [channels, guildId, pins]);

  const categoryIds = useMemo(() => groups.flatMap((g) => (g.category ? [g.category.id] : [])), [groups]);
  const reads = useReadStateStore((s) => s.byChannel);
  const collapsedMap = usePrefsStore((s) => s.collapsedCategories);
  const scrollRef = useRef<HTMLDivElement>(null);
  useRovingFocus(scrollRef, { selector: '.channel-main, .category-head > button' });
  const canManage = can(useGuildPermissions(guildId), Permission.MANAGE_CHANNELS);
  const dnd = useChannelDnd(guildId, canManage);
  const activeChannelId = useUiStore((s) => s.view.channelId);

  return (
    <aside className="sidebar" aria-label="Channels">
      <GuildHeader guildId={guildId} />
      <AttentionPill scrollRef={scrollRef} version={[groups, pinned, reads, collapsedMap]} />
      <div ref={scrollRef} className="sidebar-scroll">
        {pinned.length > 0 && (
          <section className="category is-pinned" aria-label="Pinned channels">
            <header className="category-head is-static">
              <span>Pinned</span>
            </header>
            <ul className="channel-list">
              {pinned.map((c) => (
                <ChannelRow key={c.id} channel={c} active={c.id === activeChannelId} dnd={{ ...dnd, enabled: false }} pinned />
              ))}
            </ul>
          </section>
        )}
        {groups.map((g) => (
          <Category key={g.category?.id ?? 'loose'} category={g.category} guildId={guildId} siblings={categoryIds} dnd={dnd}>
            {g.children}
          </Category>
        ))}
        {dnd.drag?.kind === 'channel' && !groups.some((g) => !g.category) && <Category category={null} guildId={guildId} siblings={categoryIds} dnd={dnd}>{[]}</Category>}
        {groups.length === 0 && <p className="sidebar-empty">No channels yet.</p>}
      </div>
    </aside>
  );
}
