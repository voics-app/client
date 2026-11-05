import { StyleSheet, Text, View } from 'react-native';
import { formatBadgeCount } from '@discordy/core/domain/unread';
import { theme } from '../theme';

/** Desktop's `.count-danger`: a red pill with the mention count. `ring` draws the cut-out border the rail badge has. */
export function Badge({ value, ring = false, noun = 'mentions' }: { value: number; ring?: boolean; /** What is counted, for the spoken label. */ noun?: string }) {
  if (value <= 0) return null;
  return (
    <View accessibilityLabel={`${value} ${noun}`} style={[styles.pill, ring && styles.ring]}>
      <Text style={styles.text}>{formatBadgeCount(value)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 9, backgroundColor: theme.danger, alignItems: 'center', justifyContent: 'center' },
  ring: { borderWidth: 3, borderColor: theme.background, minWidth: 24, height: 24, borderRadius: 12 },
  text: { color: '#ffffff', fontSize: 11, fontWeight: '700' },
});
