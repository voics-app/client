import { useLocalSearchParams } from 'expo-router';
import { OverviewScreen } from '../../../../src/serverSettings/OverviewScreen';

export default function Route() {
  const { guildId } = useLocalSearchParams<{ guildId: string }>();
  return <OverviewScreen guildId={guildId} />;
}
