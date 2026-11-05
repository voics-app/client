import { useLocalSearchParams } from 'expo-router';
import { SearchScreen } from '../../src/search/SearchScreen';

export default function SearchRoute() {
  const { channelId } = useLocalSearchParams<{ channelId: string }>();
  return <SearchScreen channelId={channelId} />;
}
