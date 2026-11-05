import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { usePresenceStore } from '@discordy/core/application/stores/peopleStores';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { customStatusLine, shownStatus, statusLabel } from '@discordy/core/domain/selfPresence';
import { StatusAvatar } from '../members/StatusAvatar';
import { metrics, theme } from '../theme';
import { StatusSheet } from './StatusSheet';

/** Desktop's UserPanel: avatar with its presence dot, name and status or custom status at the foot of the column. The name opens the status sheet, the gear the user settings. */
export function UserPanel() {
  const user = useSessionStore((s) => s.user);
  const chosen = useSessionStore((s) => s.settings.status);
  const storedCustom = useSessionStore((s) => s.settings.custom_status);
  const presence = usePresenceStore((s) => (user ? s.byUser[user.id]?.status : undefined));
  const [sheet, setSheet] = useState(false);
  if (!user) return null;
  const status = shownStatus(presence, chosen);
  const name = user.global_name || user.username;

  return (
    <View style={styles.panel}>
      <Pressable accessibilityRole="button" accessibilityLabel="Account and status" onPress={() => setSheet(true)} style={({ pressed }) => [styles.id, pressed && styles.pressed]}>
        <StatusAvatar user={user} status={status} size={34} ring={theme.raised} />
        <View style={styles.copy}>
          <Text numberOfLines={1} style={styles.name}>
            {name}
          </Text>
          <Text numberOfLines={1} style={styles.sub}>
            {customStatusLine(storedCustom, Date.now()) || statusLabel(status)}
          </Text>
        </View>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="User settings" hitSlop={6} onPress={() => router.push('/settings')} style={styles.gear}>
        <Ionicons name="settings-outline" size={22} color={theme.muted} />
      </Pressable>
      <StatusSheet visible={sheet} onClose={() => setSheet(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { flexDirection: 'row', alignItems: 'center', gap: 4, marginHorizontal: 8, marginBottom: 8, padding: 6, borderRadius: metrics.panelRadius, backgroundColor: theme.raised, borderWidth: 1, borderColor: theme.hairline },
  id: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0, minHeight: 44, padding: 2, paddingRight: 6, borderRadius: 10 },
  pressed: { backgroundColor: theme.hover },
  copy: { flex: 1, minWidth: 0 },
  name: { color: theme.text, fontSize: 13, fontWeight: '600' },
  sub: { color: theme.subtle, fontSize: 11 },
  gear: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
