import { useLocalSearchParams } from 'expo-router';
import { EmojiScreen } from '../../../../src/serverSettings/EmojiScreen';

export default function Route() {
  const { guildId } = useLocalSearchParams<{ guildId: string }>();
  return <EmojiScreen guildId={guildId} />;
}
