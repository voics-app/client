import { useLocalSearchParams } from 'expo-router';
import { MembersAdminScreen } from '../../../../src/serverSettings/MembersAdminScreen';

export default function Route() {
  const { guildId } = useLocalSearchParams<{ guildId: string }>();
  return <MembersAdminScreen guildId={guildId} />;
}
