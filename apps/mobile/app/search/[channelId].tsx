import { useLocalSearchParams } from 'expo-router';
import { SearchScreen } from '../../src/search/SearchScreen';
import { AgeRestrictedGate } from '../../src/safety/AgeRestrictedGate';

export default function SearchRoute() {
  const { channelId } = useLocalSearchParams<{ channelId: string }>();
  return <AgeRestrictedGate channelId={channelId}><SearchScreen channelId={channelId} /></AgeRestrictedGate>;
}
