import { useLocalSearchParams } from 'expo-router';
import { ThreadsScreen } from '../../src/threads/ThreadsScreen';
import { AgeRestrictedGate } from '../../src/safety/AgeRestrictedGate';

export default function ThreadsRoute() {
  const { channelId } = useLocalSearchParams<{ channelId: string }>();
  return <AgeRestrictedGate channelId={channelId}><ThreadsScreen channelId={channelId} /></AgeRestrictedGate>;
}
