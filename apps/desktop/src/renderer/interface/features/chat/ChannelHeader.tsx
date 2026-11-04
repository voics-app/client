import { At, Bell, BellSlash, ChatsCircle, Gear, Hash, Megaphone, Phone, PushPin, Television, UserCircle, UserPlus, Users, VideoCamera } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import { useCallStore } from '@renderer/application/stores/callStore';
import { useGuildStore } from '@renderer/application/stores/guildStore';
import { useNotificationSettingsStore } from '@renderer/application/stores/notificationSettingsStore';
import { useUiStore } from '@renderer/application/stores/uiStore';
import { useVoiceStore } from '@renderer/application/stores/voiceStore';
import { hasParticipants } from '@discordy/core/domain/calls';
import { canEditTopic, headerButtons, normalizeTopic, TOPIC_MAX_LENGTH } from '@discordy/core/domain/chatHeader';
import { channelOverride, isChannelMuted, MUTE_DURATIONS, NOTIFICATION_LEVELS, scopeKey } from '@discordy/core/domain/notificationSettings';
import { ChannelType, type Channel, type DeliveryMode } from '@discordy/core/contracts/rest';
import { attempt } from '../../app/actions';
import { startDmCall } from '../../app/callActions';
import { muteChannel, setChannelLevel } from '../../app/notificationActions';
import { getRuntime } from '../../app/runtime';
import { displayName } from '../../shared/hooks/useNames';
import { useChannelPermissions } from '../../shared/hooks/usePermissions';
import { Avatar } from '../../shared/ui/Avatar';
import { Button } from '../../shared/ui/Button';
import { IconButton } from '../../shared/ui/IconButton';
import { Menu, useMenu, type MenuEntry } from '../../shared/ui/Menu';
import { ModeBadge } from '../privacy/ModeBadge';
import { SearchBar } from '../search/SearchBar';
import { MarkdownView } from './MarkdownView';

/** The full topic with markdown; MANAGE_CHANNELS holders can edit it in place. */
export function TopicPopout({ channel, canEdit, onClose }: { channel: Channel; canEdit: boolean; onClose: () => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(channel.topic ?? '');
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const el = e.target as HTMLElement;
      // The topic button toggles the popout itself.
      if (!ref.current?.contains(el) && !el.closest('.channel-topic')) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      if (editing) setEditing(false);
      else onClose();
    };
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [editing, onClose]);

  const normalized = normalizeTopic(draft);
  const save = async () => {
    if (normalized === undefined) return;
    setBusy(true);
    const updated = await attempt(() => getRuntime().api.updateChannel(channel.id, { topic: normalized }), 'Could not save the topic');
    setBusy(false);
    if (!updated) return;
    useGuildStore.getState().upsertChannel(updated);
    setEditing(false);
  };

  return (
    <div ref={ref} className="topic-popout glass" role="dialog" aria-label={`Topic of ${channel.name ?? 'channel'}`}>
      <h3>{channel.name ? `#${channel.name}` : 'Channel'}</h3>
      {editing ? (
        <>
          <textarea className="input topic-edit" aria-label="Channel topic" value={draft} rows={4} autoFocus onChange={(e) => setDraft(e.target.value)} />
          <p className="setting-desc">{draft.trim().length} / {TOPIC_MAX_LENGTH}</p>
          <div className="row-end">
            <Button variant="ghost" onClick={() => { setDraft(channel.topic ?? ''); setEditing(false); }}>Cancel</Button>
            <Button variant="primary" loading={busy} disabled={normalized === undefined} onClick={() => void save()}>Save</Button>
          </div>
        </>
      ) : (
        <>
          {channel.topic ? <div className="topic-full selectable"><MarkdownView source={channel.topic} guildId={channel.guild_id} /></div> : <p className="setting-desc">No topic set.</p>}
          {canEdit && <div className="row-end"><Button onClick={() => { setDraft(channel.topic ?? ''); setEditing(true); }}>{channel.topic ? 'Edit topic' : 'Add a topic'}</Button></div>}
        </>
      )}
    </div>
  );
}

/** Bell menu: mute and notification level for this channel, the same synced settings as the channel context menu. */
export function NotificationBell({ channel }: { channel: Channel }) {
  const menu = useMenu();
  const guildId = channel.guild_id ?? null;
  const settings = useNotificationSettingsStore((s) => s.byScope[scopeKey(guildId)]);
  const muted = isChannelMuted(settings && { ...settings, muted: false }, channel.id, Date.now());
  const level = channelOverride(settings, channel.id)?.message_notifications ?? null;
  const entries: MenuEntry[] = [
    muted
      ? { kind: 'item', label: 'Unmute channel', icon: <Bell size={16} />, onSelect: () => void muteChannel(guildId, channel.id, undefined) }
      : { kind: 'submenu', label: 'Mute channel', icon: <BellSlash size={16} />, entries: MUTE_DURATIONS.map((d): MenuEntry => ({ kind: 'item', label: d.label, onSelect: () => void muteChannel(guildId, channel.id, d.seconds) })) },
    { kind: 'separator' },
    { kind: 'label', label: 'Notify me for' },
    { kind: 'item', label: 'Default', checked: level === null, onSelect: () => void setChannelLevel(guildId, channel.id, null) },
    ...NOTIFICATION_LEVELS.map((l): MenuEntry => ({ kind: 'item', label: l.label, checked: level === l.value, onSelect: () => void setChannelLevel(guildId, channel.id, l.value) })),
    { kind: 'separator' },
    { kind: 'item', label: 'Notification settings', icon: <Gear size={16} />, onSelect: () => useUiStore.getState().openDialog({ kind: 'notifications', targetId: channel.id, name: channel.name ?? 'conversation' }) },
  ];
  return (
    <>
      <IconButton label="Notification settings" active={menu.open || muted} aria-haspopup="menu" aria-expanded={menu.open} onClick={menu.openBelow}>
        {muted ? <BellSlash size={20} /> : <Bell size={20} />}
      </IconButton>
      <Menu open={menu.open} x={menu.anchor?.x ?? 0} y={menu.anchor?.y ?? 0} entries={entries} onClose={menu.close} />
    </>
  );
}

export function ChannelHeader({ channel, mode }: { channel: Channel; mode: DeliveryMode }) {
  const sidePanel = useUiStore((s) => s.sidePanel);
  const toggle = useUiStore((s) => s.toggleSidePanel);
  const inCall = useVoiceStore((s) => s.call.channelId === channel.id && s.call.status !== 'idle');
  const callInProgress = useCallStore((s) => hasParticipants(s.calls[channel.id]));
  const perms = useChannelPermissions(channel.id);
  const [topicOpen, setTopicOpen] = useState(false);
  const isDm = channel.type === ChannelType.DM || channel.type === ChannelType.GROUP_DM;
  const isThread = channel.type >= 10 && channel.type <= 12;
  const peers = channel.recipients ?? [];
  const title = isDm ? (channel.name || peers.map((u) => displayName(u)).join(', ') || 'Direct message') : (channel.name ?? '');
  const Icon = channel.type === ChannelType.GUILD_ANNOUNCEMENT ? Megaphone : isThread ? ChatsCircle : Hash;
  const buttons = headerButtons(channel);
  const canEdit = canEditTopic(channel, perms);
  const callLabel = inCall ? 'In call' : callInProgress ? 'Join call' : 'Start voice call';

  useEffect(() => setTopicOpen(false), [channel.id]);

  return (
    <header className="channel-header">
      <div className="channel-header-title">
        {isDm ? (
          channel.type === ChannelType.GROUP_DM ? <Avatar id={channel.id} name={title} avatar={channel.icon ?? null} size={26} kind="channel-icons" /> : peers.length === 1 ? <Avatar id={peers[0]!.id} name={displayName(peers[0]!)} avatar={peers[0]!.avatar} size={26} /> : <At size={22} className="channel-header-icon" />
        ) : (
          <Icon size={22} className="channel-header-icon" />
        )}
        <h1>{title}</h1>
        {(channel.topic || canEdit) && (
          <div className="channel-topic-wrap">
            <button type="button" className="channel-topic" aria-haspopup="dialog" aria-expanded={topicOpen} title={channel.topic ?? 'Set a topic'} onClick={() => setTopicOpen((v) => !v)}>
              {channel.topic || 'Add a topic'}
            </button>
            {topicOpen && <TopicPopout channel={channel} canEdit={canEdit} onClose={() => setTopicOpen(false)} />}
          </div>
        )}
      </div>
      <div className="channel-header-actions">
        <ModeBadge mode={mode} />
        <SearchBar channelId={channel.id} />
        {buttons.call && (
          <IconButton label={callLabel} active={inCall} disabled={inCall} onClick={() => void startDmCall(channel.id)}>
            <Phone size={20} weight={inCall ? 'fill' : 'regular'} />
          </IconButton>
        )}
        {buttons.videoCall && (
          <IconButton label="Start video call" disabled={inCall} onClick={() => void startDmCall(channel.id, true)}>
            <VideoCamera size={20} />
          </IconButton>
        )}
        <NotificationBell channel={channel} />
        <IconButton label="Pinned messages" active={sidePanel?.kind === 'pins'} onClick={() => toggle('pins')}><PushPin size={20} /></IconButton>
        <IconButton label="Watch Together" active={sidePanel?.kind === 'watch'} onClick={() => toggle('watch')}><Television size={20} /></IconButton>
        {buttons.addFriends && (
          <IconButton
            label="Add friends to DM"
            onClick={() => useUiStore.getState().openDialog(channel.type === ChannelType.GROUP_DM ? { kind: 'groupDm', channelId: channel.id } : { kind: 'newDm', preselect: peers.map((u) => u.id) })}
          >
            <UserPlus size={20} />
          </IconButton>
        )}
        {channel.type === ChannelType.GROUP_DM && <IconButton label="Group settings" onClick={() => useUiStore.getState().openDialog({ kind: 'groupDm', channelId: channel.id })}><Gear size={20} /></IconButton>}
        {buttons.profile && <IconButton label="User profile" active={sidePanel?.kind === 'profile'} onClick={() => toggle('profile')}><UserCircle size={20} /></IconButton>}
        {buttons.members && <IconButton label="Member list" active={sidePanel?.kind === 'members'} onClick={() => toggle('members')}><Users size={20} /></IconButton>}
      </div>
    </header>
  );
}
