import { useLocalSearchParams } from 'expo-router';
import { BansScreen } from '../../../../src/serverSettings/BansScreen';

export default function Route() {
  const { guildId } = useLocalSearchParams<{ guildId: string }>();
  return <BansScreen guildId={guildId} />;
}
