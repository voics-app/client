import { useLocalSearchParams } from 'expo-router';
import { ChannelScreen } from '../../../src/messages/ChannelScreen';
import { useSelectView } from '../../../src/shell/useSelectView';

export default function ChannelRoute() {
  const { guildId, channelId } = useLocalSearchParams<{ guildId: string; channelId: string }>();
  useSelectView({ kind: 'guild', guildId, channelId });
  return <ChannelScreen guildId={guildId} channelId={channelId} />;
}
