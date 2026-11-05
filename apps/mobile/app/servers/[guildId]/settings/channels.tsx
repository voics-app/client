import { useLocalSearchParams } from 'expo-router';
import { ChannelsAdminScreen } from '../../../../src/serverSettings/ChannelsAdminScreen';

export default function Route() {
  const { guildId } = useLocalSearchParams<{ guildId: string }>();
  return <ChannelsAdminScreen guildId={guildId} />;
}
