import { useLocalSearchParams } from 'expo-router';
import { VoiceScreen } from '../../src/voice/VoiceScreen';
import { AgeRestrictedGate } from '../../src/safety/AgeRestrictedGate';

export default function VoiceRoute() {
  const { channelId } = useLocalSearchParams<{ channelId: string }>();
  return <AgeRestrictedGate channelId={channelId}><VoiceScreen channelId={channelId} /></AgeRestrictedGate>;
}
