import { useLocalSearchParams } from 'expo-router';
import { RoleEditScreen } from '../../../../../src/serverSettings/RoleEditScreen';

export default function Route() {
  const { guildId, roleId } = useLocalSearchParams<{ guildId: string; roleId: string }>();
  return <RoleEditScreen guildId={guildId} roleId={roleId} />;
}
