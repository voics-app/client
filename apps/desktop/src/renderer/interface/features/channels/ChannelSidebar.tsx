import { CaretDown, CaretRight, ChatsCircle, Gear, Hash, LockKey, Megaphone, Plugs, Plus, SpeakerHigh, UserPlus } from '@phosphor-icons/react';
import { useMemo, useRef } from 'react';
import { useGuildStore } from '@renderer/application/stores/guildStore';
import { useReadStateStore } from '@renderer/application/stores/peopleStores';
import { usePrefsStore } from '@renderer/application/stores/prefsStore';
import { useUiStore } from '@renderer/application/stores/uiStore';
import { useVoiceStore, usersInChannel } from '@renderer/application/stores/voiceStore';
import { isUnread } from '@renderer/domain/unread';
import { Permission } from '@shared/contracts/permissions';
import { ChannelType, type Channel } from '@shared/contracts/rest';
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
import { GuildHeader } from './GuildHeader';
import { ChannelContextMenuEntries } from './channelMenu';

const ICONS = { text: Hash, voice: SpeakerHigh, announcement: Megaphone, forum: ChatsCircle, stage: SpeakerHigh, thread: Hash };

function ChannelRow({ channel, active }: { channel: Channel; active: boolean }) {
  const read = useReadStateStore((s) => s.byChannel[channel.id]);
  const muted = usePrefsStore((s) => s.mutedChannels[channel.id]);
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
  const entries = ChannelContextMenuEntries(channel, perms, { openDialog, openSettings, markRead: () => markChannelRead(channel.id) });

  if (!can(perms, Permission.VIEW_CHANNEL)) return null;

  const select = () => {
    if (isVoice) void openVoiceChannel(channel.guild_id ?? null, channel.id);
    else if (channel.guild_id) navigate({ kind: 'guild', guildId: channel.guild_id, channelId: channel.id });
    else openChannel(channel.id);
  };

  return (
    <li>
      <div className={`channel-row${active ? ' is-active' : ''}${unread ? ' is-unread' : ''}${muted ? ' is-muted' : ''}`} onContextMenu={menu.openAt}>
        <button type="button" className="channel-main" onClick={select} aria-current={active || undefined}>
          {unread && <span className="channel-unread-dot" aria-label="Unread" />}
          <Icon size={18} className="channel-icon" weight={active ? 'fill' : 'regular'} />
          <span className="channel-name">{channel.name}</span>
          {channel.delivery_mode === 'ephemeral' && <LockKey size={13} weight="fill" className="channel-mode mode-ephemeral" aria-label="Ephemeral E2EE" />}
          {channel.delivery_mode === 'p2p' && <Plugs size={13} weight="fill" className="channel-mode mode-p2p" aria-label="Peer-to-peer" />}
          <Count value={mentions} tone="danger" />
        </button>
        {can(perms, Permission.CREATE_INSTANT_INVITE) && channel.guild_id && (
          <span className="channel-actions">
            <IconButton label="Create invite" size="sm" onClick={() => openDialog({ kind: 'invite', guildId: channel.guild_id!, channelId: channel.id })}>
              <UserPlus size={15} />
            </IconButton>
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
          {occupants.map((v) => {
            const member = v.member ?? useGuildStore.getState().members[channel.guild_id ?? '']?.[v.user_id];
            const user = member?.user;
            const name = user ? displayName(user, member?.nick) : v.user_id;
            return (
              <li key={v.user_id} className="occupant">
                <Avatar id={v.user_id} name={name} avatar={user?.avatar} size={22} speaking={speaking[v.user_id] ?? 0} />
                <span>{name}</span>
                {(v.self_mute || v.mute) && <span className="occupant-flag" title="Muted">M</span>}
                {v.self_video && <span className="occupant-flag" title="Camera on">V</span>}
                {v.self_stream && <span className="occupant-live">LIVE</span>}
              </li>
            );
          })}
        </ul>
      )}
      <Menu open={menu.open} x={menu.anchor?.x ?? 0} y={menu.anchor?.y ?? 0} entries={entries} onClose={menu.close} />
    </li>
  );
}

function Category({ category, children, guildId }: { category: Channel | null; children: Channel[]; guildId: string }) {
  const collapsed = usePrefsStore((s) => (category ? s.collapsedCategories[category.id] : false));
  const toggle = usePrefsStore((s) => s.toggleMap);
  const openDialog = useUiStore((s) => s.openDialog);
  const perms = useGuildPermissions(guildId);
  const view = useUiStore((s) => s.view);
  const activeId = view.channelId;
  const visible = collapsed ? children.filter((c) => c.id === activeId) : children;
  return (
    <section className="category">
      {category && (
        <header className="category-head">
          <button type="button" onClick={() => toggle('collapsedCategories', category.id)} aria-expanded={!collapsed}>
            {collapsed ? <CaretRight size={11} weight="bold" /> : <CaretDown size={11} weight="bold" />}
            <span>{category.name}</span>
          </button>
          {can(perms, Permission.MANAGE_CHANNELS) && (
            <IconButton label="Create channel" size="sm" onClick={() => openDialog({ kind: 'createChannel', guildId, parentId: category.id })}>
              <Plus size={14} />
            </IconButton>
          )}
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

  const scrollRef = useRef<HTMLDivElement>(null);
  useRovingFocus(scrollRef, { selector: '.channel-main, .category-head > button' });

  return (
    <aside className="sidebar" aria-label="Channels">
      <GuildHeader guildId={guildId} />
      <div ref={scrollRef} className="sidebar-scroll">
        {groups.map((g) => (
          <Category key={g.category?.id ?? 'loose'} category={g.category} guildId={guildId}>
            {g.children}
          </Category>
        ))}
        {groups.length === 0 && <p className="sidebar-empty">No channels yet.</p>}
      </div>
    </aside>
  );
}
