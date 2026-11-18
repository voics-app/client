import { useLocalSearchParams } from 'expo-router';
import { PinsScreen } from '../../src/pins/PinsScreen';
import { AgeRestrictedGate } from '../../src/safety/AgeRestrictedGate';

export default function PinsRoute() {
  const { channelId } = useLocalSearchParams<{ channelId: string }>();
  return <AgeRestrictedGate channelId={channelId}><PinsScreen channelId={channelId} /></AgeRestrictedGate>;
}
