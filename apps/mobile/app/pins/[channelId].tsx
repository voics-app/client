import { useLocalSearchParams } from 'expo-router';
import { PinsScreen } from '../../src/pins/PinsScreen';

export default function PinsRoute() {
  const { channelId } = useLocalSearchParams<{ channelId: string }>();
  return <PinsScreen channelId={channelId} />;
}
