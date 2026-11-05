import { useLocalSearchParams } from 'expo-router';
import { GroupSettingsScreen } from '../../src/groups/GroupSettingsScreen';

export default function Route() {
  const { channelId } = useLocalSearchParams<{ channelId: string }>();
  return <GroupSettingsScreen channelId={channelId} />;
}
