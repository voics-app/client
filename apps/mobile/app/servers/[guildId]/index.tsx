import { useLocalSearchParams } from 'expo-router';
import { MainScreen } from '../../../src/shell/MainScreen';

export default function ServerRoute() {
  const { guildId } = useLocalSearchParams<{ guildId: string }>();
  return <MainScreen select={{ kind: 'guild', guildId, channelId: null }} />;
}
