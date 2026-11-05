import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '../theme';

/** The line with "New" above the first message that arrived since you last read the channel. */
export function NewDivider() {
  return (
    <View accessibilityRole="text" accessibilityLabel="New messages" style={styles.divider}>
      <View style={styles.line} />
      <Text style={styles.label}>NEW</Text>
      <View style={styles.line} />
    </View>
  );
}

/** Banner at the top of the chat: how many messages arrived since the marker, with Mark as read. */
export function UnreadBar({ count, more, onMarkRead }: { count: number; more: boolean; onMarkRead(): void }) {
  const label = `${count}${more ? '+' : ''} new ${count === 1 && !more ? 'message' : 'messages'}`;
  return (
    <View style={styles.bar}>
      <Text style={styles.barText}>{label}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Mark as read" onPress={onMarkRead} style={styles.barAction}>
        <Text style={styles.barActionText}>Mark as read</Text>
      </Pressable>
    </View>
  );
}

/** Round button over the list that returns to the newest message. */
export function JumpToLatest({ onPress }: { onPress(): void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Jump to latest" onPress={onPress} style={styles.jump}>
      <Ionicons name="arrow-down" size={22} color={theme.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  divider: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, marginTop: 12 },
  line: { flex: 1, height: 1, backgroundColor: theme.danger },
  label: { color: theme.danger, fontSize: 11, fontWeight: '700', letterSpacing: 0.6 },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: theme.accentSoft, paddingLeft: 16, paddingRight: 4, minHeight: 44 },
  barText: { color: theme.text, fontSize: 14, fontWeight: '600' },
  barAction: { minHeight: 44, minWidth: 44, paddingHorizontal: 12, justifyContent: 'center' },
  barActionText: { color: theme.accent, fontSize: 14, fontWeight: '600' },
  jump: { position: 'absolute', right: 16, bottom: 12, width: 44, height: 44, borderRadius: 22, backgroundColor: theme.raisedHover, borderWidth: 1, borderColor: theme.hairlineStrong, alignItems: 'center', justifyContent: 'center' },
});
