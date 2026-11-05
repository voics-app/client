import { useLocalSearchParams } from 'expo-router';
import { AuditScreen } from '../../../../src/serverSettings/AuditScreen';

export default function Route() {
  const { guildId } = useLocalSearchParams<{ guildId: string }>();
  return <AuditScreen guildId={guildId} />;
}
