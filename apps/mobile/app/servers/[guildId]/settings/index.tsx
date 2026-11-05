import { useLocalSearchParams } from 'expo-router';
import { SettingsHomeScreen } from '../../../../src/serverSettings/SettingsHomeScreen';

export default function Route() {
  const { guildId } = useLocalSearchParams<{ guildId: string }>();
  return <SettingsHomeScreen guildId={guildId} />;
}
