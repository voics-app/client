import { useLocalSearchParams } from 'expo-router';
import { GroupSettingsScreen } from '../../src/groups/GroupSettingsScreen';
import { AgeRestrictedGate } from '../../src/safety/AgeRestrictedGate';

export default function Route() {
  const { channelId } = useLocalSearchParams<{ channelId: string }>();
  return <AgeRestrictedGate channelId={channelId}><GroupSettingsScreen channelId={channelId} /></AgeRestrictedGate>;
}
