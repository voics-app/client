import { useLocalSearchParams } from 'expo-router';
import { ChannelScreen } from '../../src/messages/ChannelScreen';
import { useSelectView } from '../../src/shell/useSelectView';

export default function DmRoute() {
  const { channelId } = useLocalSearchParams<{ channelId: string }>();
  useSelectView({ kind: 'home', channelId });
  return <ChannelScreen channelId={channelId} />;
}
