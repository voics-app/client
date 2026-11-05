import { useLocalSearchParams } from 'expo-router';
import { RolesScreen } from '../../../../../src/serverSettings/RolesScreen';

export default function Route() {
  const { guildId } = useLocalSearchParams<{ guildId: string }>();
  return <RolesScreen guildId={guildId} />;
}
