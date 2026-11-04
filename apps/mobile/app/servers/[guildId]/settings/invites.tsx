import { useLocalSearchParams } from 'expo-router';
import { InvitesScreen } from '../../../../src/serverSettings/InvitesScreen';

export default function Route() {
  const { guildId } = useLocalSearchParams<{ guildId: string }>();
  return <InvitesScreen guildId={guildId} />;
}
