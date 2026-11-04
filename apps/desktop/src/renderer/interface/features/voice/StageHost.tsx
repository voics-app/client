import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { ChatView } from '../chat/ChatView';
import { isVoiceChannel } from '../../app/navigation';
import { ForumView } from '../chat/ForumView';
import { ChannelType } from '@discordy/core/contracts/rest';
import { VoiceChannelView } from './VoiceChannelView';

/** Chooses what fills the main stage for a channel: chat, voice room or forum. */
export function StageHost({ channelId }: { channelId: string }) {
  const channel = useGuildStore((s) => s.channels[channelId]);
  if (!channel) return <div className="stage-empty" />;
  if (isVoiceChannel(channel)) return <VoiceChannelView channelId={channelId} />;
  if (channel.type === ChannelType.GUILD_FORUM) return <ForumView channelId={channelId} />;
  return <ChatView channelId={channelId} />;
}
