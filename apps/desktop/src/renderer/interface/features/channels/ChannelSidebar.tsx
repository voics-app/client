import { CaretDown, CaretRight, ChatsCircle, Gear, Hash, LockKey, LockSimple, Megaphone, Plugs, Plus, SpeakerHigh, UserPlus } from '@phosphor-icons/react';
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useGuildStore } from '@renderer/application/stores/guildStore';
import { useReadStateStore } from '@renderer/application/stores/peopleStores';
import { usePrefsStore } from '@renderer/application/stores/prefsStore';
import { useUiStore } from '@renderer/application/stores/uiStore';
import { useVoiceStore, usersInChannel } from '@renderer/application/stores/voiceStore';
import { isUnread } from '@renderer/domain/unread';
import { isPrivateChannel, offscreenMentions, visibleChannelIds, type ActivityFacts } from '@renderer/domain/channelActivity';
import { isChannelMutedDeep, scopeKey } from '@renderer/domain/notificationSettings';
import { useNotificationSettingsStore } from '@renderer/application/stores/notificationSettingsStore';
import { Permission } from '@shared/contracts/permissions';
import { ChannelType, type Channel, type VoiceState } from '@shared/contracts/rest';
import { channelIcon, openChannel } from '../../app/navigation';
import { openVoiceChannel } from '../../app/voiceActions';
import { markChannelRead } from '../../app/actions';
import { can, useChannelPermissions, useGuildPermissions } from '../../shared/hooks/usePermissions';
import { displayName } from '../../shared/hooks/useNames';
import { Avatar } from '../../shared/ui/Avatar';
import { IconButton } from '../../shared/ui/IconButton';
import { Count } from '../../shared/ui/Misc';
import { Menu, useMenu } from '../../shared/ui/Menu';
import { useRovingFocus } from '../../shared/hooks/useRovingFocus';
import { useUserMenu } from '../members/UserContextMenu';
import { GuildHeader } from './GuildHeader';
import { CategoryContextMenuEntries, ChannelContextMenuEntries } from './channelMenu';

const ICONS = { text: Hash, voice: SpeakerHigh, announcement: Megaphone, forum: ChatsCircle, stage: SpeakerHigh, thread: Hash };

export function VoiceOccupant({ guildId, state, speaking }: { guildId: string | null; state: VoiceState; speaking: number }) {
  const member = useGuildStore((s) => (guildId ? s.members[guildId]?.[state.user_id] : undefined)) ?? state.member;
  const user = member?.user;
  const name = user ? displayName(user, member?.nick) : state.user_id;
  const openDialog = useUiStore((s) => s.openDialog);
  const { bind, node } = useUserMenu({ userId: state.user_id, name, guildId, user });
  return (
    <li className="occupant" {...bind} onClick={() => openDialog({ kind: 'profile', userId: state.user_id, guildId })}>
      <Avatar id={state.user_id} name={name} avatar={user?.avatar} size={22} speaking={speaking} />
      <span>{name}</span>
      {(state.self_mute || state.mute) && <span className="occupant-flag" title="Muted">M</span>}
      {state.self_video && <span className="occupant-flag" title="Camera on">V</span>}
      {state.self_stream && <span className="occupant-live">LIVE</span>}
      {node}
    </li>
  );
}

function ChannelRow({ channel, active }: { channel: Channel; active: boolean }) {
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
  const entries = ChannelContextMenuEntries(channel, perms, { openDialog, openSettings, markRead: () => markChannelRead(channel.id), hasUnread: unread || mentions > 0 });

  if (!can(perms, Permission.VIEW_CHANNEL)) return null;

  const select = () => {
    if (isVoice) void openVoiceChannel(channel.guild_id ?? null, channel.id);
    else if (channel.guild_id) navigate({ kind: 'guild', guildId: channel.guild_id, channelId: channel.id });
    else openChannel(channel.id);
  };

  return (
    <li data-channel-id={channel.id} data-attention={mentions > 0 ? 'mention' : unread ? 'unread' : undefined}>
      <div className={`channel-row${active ? ' is-active' : ''}${unread ? ' is-unread' : ''}${muted ? ' is-muted' : ''}`} onContextMenu={menu.openAt}>
        <button type="button" className="channel-main" onClick={select} aria-current={active || undefined}>
          {unread && <span className="channel-unread-dot" aria-label="Unread" />}
          <Icon size={18} className="channel-icon" weight={active ? 'fill' : 'regular'} />
          <span className="channel-name">{channel.name}</span>
          {isPrivateChannel(channel) && <LockSimple size={12} weight="fill" className="channel-lock" aria-label="Private channel" />}
          {channel.nsfw && <span className="channel-nsfw" title="Age-restricted" aria-label="Age-restricted">18+</span>}
          {channel.delivery_mode === 'ephemeral' && <LockKey size={13} weight="fill" className="channel-mode mode-ephemeral" aria-label="Ephemeral E2EE" />}
          {channel.delivery_mode === 'p2p' && <Plugs size={13} weight="fill" className="channel-mode mode-p2p" aria-label="Peer-to-peer" />}
          <Count value={mentions} tone="danger" />
        </button>
        {channel.guild_id && (can(perms, Permission.CREATE_INSTANT_INVITE) || can(perms, Permission.MANAGE_CHANNELS)) && (
          <span className="channel-actions">
            {can(perms, Permission.CREATE_INSTANT_INVITE) && (
              <IconButton label="Create invite" size="sm" onClick={() => openDialog({ kind: 'invite', guildId: channel.guild_id!, channelId: channel.id })}>
                <UserPlus size={15} />
              </IconButton>
            )}
            {can(perms, Permission.MANAGE_CHANNELS) && (
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

function Category({ category, children, guildId, siblings }: { category: Channel | null; children: Channel[]; guildId: string; siblings: string[] }) {
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
  return (
    <section className="category">
      {category && (
        <header className="category-head" onContextMenu={menu.openAt}>
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
          <ChannelRow key={c.id} channel={c} active={c.id === activeId} />
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
  const groups = useMemo(() => {
    const inGuild = Object.values(channels)
      .filter((c) => c.guild_id === guildId && !(c.type >= 10 && c.type <= 12))
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.id.localeCompare(b.id));
    const categories = inGuild.filter((c) => c.type === ChannelType.GUILD_CATEGORY);
    const loose = inGuild.filter((c) => c.type !== ChannelType.GUILD_CATEGORY && !c.parent_id);
    const result: { category: Channel | null; children: Channel[] }[] = [];
    if (loose.length > 0) result.push({ category: null, children: loose });
    for (const category of categories) result.push({ category, children: inGuild.filter((c) => c.parent_id === category.id && c.type !== ChannelType.GUILD_CATEGORY) });
    return result;
  }, [channels, guildId]);

  const categoryIds = useMemo(() => groups.flatMap((g) => (g.category ? [g.category.id] : [])), [groups]);
  const reads = useReadStateStore((s) => s.byChannel);
  const collapsedMap = usePrefsStore((s) => s.collapsedCategories);
  const scrollRef = useRef<HTMLDivElement>(null);
  useRovingFocus(scrollRef, { selector: '.channel-main, .category-head > button' });

  return (
    <aside className="sidebar" aria-label="Channels">
      <GuildHeader guildId={guildId} />
      <AttentionPill scrollRef={scrollRef} version={[groups, reads, collapsedMap]} />
      <div ref={scrollRef} className="sidebar-scroll">
        {groups.map((g) => (
          <Category key={g.category?.id ?? 'loose'} category={g.category} guildId={guildId} siblings={categoryIds}>
            {g.children}
          </Category>
        ))}
        {groups.length === 0 && <p className="sidebar-empty">No channels yet.</p>}
      </div>
    </aside>
  );
}
