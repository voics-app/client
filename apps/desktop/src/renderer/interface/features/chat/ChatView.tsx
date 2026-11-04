import { useEffect } from 'react';
import { useGuildStore } from '@renderer/application/stores/guildStore';
import { typingUsers, useTypingStore } from '@renderer/application/stores/peopleStores';
import { useSessionStore } from '@renderer/application/stores/sessionStore';
import { useVoiceStore } from '@renderer/application/stores/voiceStore';
import { typingLine } from '@discordy/core/domain/composerFormat';
import { ChannelType } from '@discordy/core/contracts/rest';
import { getRuntime } from '../../app/runtime';
import { displayName } from '../../shared/hooks/useNames';
import { useNow } from '../../shared/hooks/useNow';
import { CallStrip } from '../voice/CallStrip';
import { ChannelHeader } from './ChannelHeader';
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
  const text = typingLine(names);
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
  const inCall = useVoiceStore((s) => s.call.channelId === channelId && s.call.status !== 'idle');
  useSessionStore((s) => s.settings); // re-resolve the mode when account defaults or overrides change
  const mode = channel ? getRuntime().privacy.sender.resolveMode(channel) : 'standard';

  if (!channel) return <div className="stage-empty" />;
  const title = channel.type === ChannelType.DM || channel.type === ChannelType.GROUP_DM ? (channel.name || (channel.recipients ?? []).map((u) => displayName(u)).join(', ') || 'Direct message') : (channel.name ?? '');

  return (
    <section className="chat" aria-label={title}>
      <ChannelHeader channel={channel} mode={mode} />
      {inCall && <CallStrip channelId={channelId} />}
      <MessageList channelId={channelId} />
      <TypingBar channelId={channelId} />
      <Composer channel={channel} mode={mode} />
    </section>
  );
}
