import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable } from 'react-native';
import { theme } from '../theme';

/** The people icon in a server channel's header; opens that server's member list. */
export function MembersButton({ guildId }: { guildId: string }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Member list" hitSlop={8} onPress={() => router.push(`/servers/${guildId}/members`)}>
      <Ionicons name="people-outline" size={24} color={theme.text} />
    </Pressable>
  );
}
