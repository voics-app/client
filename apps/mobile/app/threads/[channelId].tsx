import { useLocalSearchParams } from 'expo-router';
import { ThreadsScreen } from '../../src/threads/ThreadsScreen';

export default function ThreadsRoute() {
  const { channelId } = useLocalSearchParams<{ channelId: string }>();
  return <ThreadsScreen channelId={channelId} />;
}
