import { useLocalSearchParams } from 'expo-router';
import { ChannelScreen } from '../../src/messages/ChannelScreen';
import { useSelectView } from '../../src/shell/useSelectView';
import { AgeRestrictedGate } from '../../src/safety/AgeRestrictedGate';

export default function DmRoute() {
  const { channelId } = useLocalSearchParams<{ channelId: string }>();
  useSelectView({ kind: 'home', channelId });
  return <AgeRestrictedGate channelId={channelId}><ChannelScreen channelId={channelId} /></AgeRestrictedGate>;
}
