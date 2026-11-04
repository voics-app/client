import { useLocalSearchParams } from 'expo-router';
import { ChannelScreen } from '../../../src/messages/ChannelScreen';

export default function DmRoute() {
  const { channelId } = useLocalSearchParams<{ channelId: string }>();
  return <ChannelScreen channelId={channelId} />;
}
