import { useLocalSearchParams } from 'expo-router';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { ChannelScreen } from '../../../src/messages/ChannelScreen';
import { channelScreenKind } from '../../../src/servers/channelScreenKind';
import { UnsupportedChannelScreen } from '../../../src/servers/UnsupportedChannelScreen';
import { useSelectView } from '../../../src/shell/useSelectView';
import { VoiceChannelScreen } from '../../../src/voice/VoiceChannelScreen';

export default function ChannelRoute() {
  const { guildId, channelId } = useLocalSearchParams<{ guildId: string; channelId: string }>();
  const channel = useGuildStore((s) => s.channels[channelId]);
  useSelectView({ kind: 'guild', guildId, channelId });
  const kind = channelScreenKind(channel);
  if (kind.screen === 'voice') return <VoiceChannelScreen channelId={channelId} />;
  if (kind.screen === 'unsupported') return <UnsupportedChannelScreen channelId={channelId} message={kind.message} />;
  return <ChannelScreen guildId={guildId} channelId={channelId} />;
}
