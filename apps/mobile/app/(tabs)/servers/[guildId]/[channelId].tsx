import { useLocalSearchParams } from 'expo-router';
import { ChannelScreen } from '../../../../src/messages/ChannelScreen';

export default function ChannelRoute() {
  const { guildId, channelId } = useLocalSearchParams<{ guildId: string; channelId: string }>();
  return <ChannelScreen guildId={guildId} channelId={channelId} />;
}
