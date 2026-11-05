import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import type { DeliveryMode } from '@discordy/core/contracts/rest';
import { MODE_COPY } from '@discordy/core/domain/deliveryMode';
import { theme } from '../theme';

const ICON = { standard: 'globe-outline', ephemeral: 'lock-closed', p2p: 'link' } as const;

/** The always-visible delivery-mode marker, as the desktop ModeBadge: icon and label both carry the mode, never colour alone. */
export function ModeBadge({ mode }: { mode: DeliveryMode }) {
  const copy = MODE_COPY[mode];
  const encrypted = mode !== 'standard';
  const color = encrypted ? theme.accent : theme.subtle;
  return (
    <View accessible accessibilityRole="text" accessibilityLabel={`Delivery mode: ${copy.label}. ${copy.description}`} style={[styles.badge, encrypted && styles.encrypted]}>
      <Ionicons name={ICON[mode]} size={13} color={color} />
      <Text style={[styles.label, { color }]}>{copy.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 9, minHeight: 24, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairlineStrong },
  encrypted: { backgroundColor: theme.accentSoft, borderColor: theme.accent },
  label: { fontSize: 12, fontWeight: '600' },
});
