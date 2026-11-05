import { useLocalSearchParams } from 'expo-router';
import { VoiceScreen } from '../../src/voice/VoiceScreen';

export default function VoiceRoute() {
  const { channelId } = useLocalSearchParams<{ channelId: string }>();
  return <VoiceScreen channelId={channelId} />;
}
