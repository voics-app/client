import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import type { User } from '@discordy/core/contracts/rest';
import { Avatar } from '../profile/Avatar';
import { theme } from '../theme';

export const CALLS_NOTICE = "Calls aren't in this test version yet.";

const showCallsNotice = () => Alert.alert('Calls', CALLS_NOTICE);

/** The header title: `# name` in a server, the person's avatar and name in a direct message. */
export function ChatHeaderTitle({ title, peer }: { title: string; peer: User | null }) {
  return (
    <View style={styles.title}>
      {peer && <Avatar user={peer} size={28} />}
      <Text accessibilityRole="header" numberOfLines={1} style={styles.titleText}>
        {title}
      </Text>
    </View>
  );
}

function HeaderButton({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress(): void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} hitSlop={6} onPress={onPress} style={styles.button}>
      <Ionicons name={icon} size={22} color={theme.text} />
    </Pressable>
  );
}

export interface ChatHeaderActionsProps {
  /** Opens the other person's profile; set only in a 1:1 direct message. */
  onProfile?: () => void;
  /** Direct and group conversations get call buttons; their notice says calls are not built yet. */
  calls: boolean;
  /** The right-most slot, where a channel's members button goes. */
  trailing?: ReactNode;
}

export function ChatHeaderActions({ onProfile, calls, trailing }: ChatHeaderActionsProps) {
  return (
    <View style={styles.actions}>
      {calls && <HeaderButton icon="call-outline" label="Voice call" onPress={showCallsNotice} />}
      {calls && <HeaderButton icon="videocam-outline" label="Video call" onPress={showCallsNotice} />}
      {onProfile && <HeaderButton icon="person-circle-outline" label="View profile" onPress={onProfile} />}
      {trailing}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: 220 },
  titleText: { color: theme.text, fontSize: 17, fontWeight: '700', flexShrink: 1 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  button: { padding: 2 },
});
