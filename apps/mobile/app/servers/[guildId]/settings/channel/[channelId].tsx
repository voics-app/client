import { useLocalSearchParams } from 'expo-router';
import { ChannelEditScreen } from '../../../../../src/serverSettings/ChannelEditScreen';

export default function Route() {
  const { guildId, channelId } = useLocalSearchParams<{ guildId: string; channelId: string }>();
  return <ChannelEditScreen guildId={guildId} channelId={channelId} />;
}
