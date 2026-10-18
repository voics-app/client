import { Hash, Megaphone, Phone, PushPin, Users, Television, ChatsCircle, At } from '@phosphor-icons/react';
import { useEffect } from 'react';
import { useGuildStore } from '@renderer/application/stores/guildStore';
import { typingUsers, useTypingStore } from '@renderer/application/stores/peopleStores';
import { useSessionStore } from '@renderer/application/stores/sessionStore';
import { useUiStore } from '@renderer/application/stores/uiStore';
import { useVoiceStore } from '@renderer/application/stores/voiceStore';
import { ChannelType } from '@shared/contracts/rest';
import { getRuntime } from '../../app/runtime';
import { joinVoiceChannel } from '../../app/voiceActions';
import { displayName } from '../../shared/hooks/useNames';
import { useNow } from '../../shared/hooks/useNow';
import { Avatar } from '../../shared/ui/Avatar';
import { IconButton } from '../../shared/ui/IconButton';
import { ModeBadge } from '../privacy/ModeBadge';
import { CallStrip } from '../voice/CallStrip';
import { Composer } from './Composer';
import { MessageList } from './MessageList';

function TypingBar({ channelId }: { channelId: string }) {
  const byChannel = useTypingStore((s) => s.byChannel);
  const me = useSessionStore((s) => s.user?.id ?? null);
  const members = useGuildStore((s) => s.members);
  const channel = useGuildStore((s) => s.channels[channelId]);
  const now = useNow(1500);
  const prune = useTypingStore((s) => s.prune);
  useEffect(() => prune(now), [now, prune]);
  const ids = typingUsers(byChannel, channelId, me, now);
  const names = ids.map((id) => {
    const m = channel?.guild_id ? members[channel.guild_id]?.[id] : undefined;
    const user = m?.user ?? channel?.recipients?.find((u) => u.id === id);
    return user ? displayName(user, m?.nick) : 'Someone';
  });
  const text = names.length === 0 ? '' : names.length === 1 ? `${names[0]} is typing` : names.length === 2 ? `${names[0]} and ${names[1]} are typing` : 'Several people are typing';
  return (
    <div className="typing-bar" aria-live="polite">
      {names.length > 0 && (
        <>
          <span className="typing-dots" aria-hidden="true"><i /><i /><i /></span>
          <span>{text}</span>
        </>
      )}
    </div>
  );
}

export function ChatView({ channelId }: { channelId: string }) {
  const channel = useGuildStore((s) => s.channels[channelId]);
  const sidePanel = useUiStore((s) => s.sidePanel);
  const toggle = useUiStore((s) => s.toggleSidePanel);
  const inCall = useVoiceStore((s) => s.call.channelId === channelId && s.call.status !== 'idle');
  useSessionStore((s) => s.settings); // re-resolve the mode when account defaults or overrides change
  const mode = channel ? getRuntime().privacy.sender.resolveMode(channel) : 'standard';

  if (!channel) return <div className="stage-empty" />;
  const isDm = channel.type === ChannelType.DM || channel.type === ChannelType.GROUP_DM;
  const isThread = channel.type >= 10 && channel.type <= 12;
  const peers = channel.recipients ?? [];
  const title = isDm ? (channel.name || peers.map((u) => displayName(u)).join(', ') || 'Direct message') : (channel.name ?? '');
  const Icon = channel.type === ChannelType.GUILD_ANNOUNCEMENT ? Megaphone : isThread ? ChatsCircle : Hash;

  return (
    <section className="chat" aria-label={title}>
      <header className="channel-header">
        <div className="channel-header-title">
          {isDm ? (
            peers.length === 1 ? <Avatar id={peers[0]!.id} name={displayName(peers[0]!)} avatar={peers[0]!.avatar} size={26} /> : <At size={22} className="channel-header-icon" />
          ) : (
            <Icon size={22} className="channel-header-icon" />
          )}
          <h1>{title}</h1>
          {channel.topic && <span className="channel-topic" title={channel.topic}>{channel.topic}</span>}
        </div>
        <div className="channel-header-actions">
          <ModeBadge mode={mode} />
          {isDm && (
            <IconButton label={inCall ? 'In call' : 'Start voice call'} active={inCall} disabled={inCall} onClick={() => void joinVoiceChannel(null, channel.id)}>
              <Phone size={20} weight={inCall ? 'fill' : 'regular'} />
            </IconButton>
          )}
          <IconButton label="Pinned messages" active={sidePanel?.kind === 'pins'} onClick={() => toggle('pins')}><PushPin size={20} /></IconButton>
          <IconButton label="Watch Together" active={sidePanel?.kind === 'watch'} onClick={() => toggle('watch')}><Television size={20} /></IconButton>
          {!isDm && <IconButton label="Member list" active={sidePanel?.kind === 'members'} onClick={() => toggle('members')}><Users size={20} /></IconButton>}
        </div>
      </header>
      {inCall && <CallStrip channelId={channelId} />}
      <MessageList channelId={channelId} />
      <TypingBar channelId={channelId} />
      <Composer channel={channel} mode={mode} />
    </section>
  );
}
