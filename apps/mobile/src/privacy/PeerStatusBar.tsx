import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { usePrivacyStore } from '@discordy/core/application/stores/privacyStore';
import type { DeliveryMode } from '@discordy/core/contracts/rest';
import { theme } from '../theme';
import { peerStatusLine, type StatusTone } from './peerStatusModel';

const ICON: Record<StatusTone, keyof typeof Ionicons.glyphMap> = { info: 'information-circle-outline', ok: 'link', warn: 'warning-outline', danger: 'shield-outline' };

/** Honest connection state above the composer; nothing for a healthy standard chat. Danger lines are announced as alerts. */
export function PeerStatusBar({ channelId, mode, onSafetyNumber }: { channelId: string; mode: DeliveryMode; onSafetyNumber?: () => void }) {
  const p2p = usePrivacyStore((s) => s.p2p[channelId]);
  const group = usePrivacyStore((s) => s.groups[channelId]);
  const line = peerStatusLine({ mode, p2p, group });
  if (!line) return null;
  const color = line.tone === 'danger' ? theme.danger : line.tone === 'ok' ? theme.success : line.tone === 'warn' ? theme.text : theme.muted;
  return (
    <View accessibilityRole={line.tone === 'danger' ? 'alert' : undefined} accessibilityLiveRegion="polite" style={styles.bar}>
      {line.busy ? <ActivityIndicator size="small" color={theme.muted} /> : <Ionicons name={ICON[line.tone]} size={16} color={color} />}
      <Text style={[styles.text, { color }]}>{line.text}</Text>
      {line.safetyNumber && onSafetyNumber && (
        <Pressable accessibilityRole="button" accessibilityLabel="Safety number" onPress={onSafetyNumber} hitSlop={8} style={styles.action}>
          <Ionicons name="finger-print" size={16} color={theme.accent} />
          <Text style={styles.actionText}>Safety number</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, paddingHorizontal: 14, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.hairline },
  text: { flexShrink: 1, fontSize: 13 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 32 },
  actionText: { color: theme.accent, fontSize: 13, fontWeight: '600' },
});
