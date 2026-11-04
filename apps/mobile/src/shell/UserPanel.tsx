import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { activeCustomStatus } from '@discordy/core/domain/selfPresence';
import { Avatar } from '../profile/Avatar';
import { metrics, theme } from '../theme';

const STATUS_LABEL: Record<string, string> = { online: 'Online', idle: 'Idle', dnd: 'Do not disturb', invisible: 'Invisible' };

/** Desktop's UserPanel: avatar, name and status at the foot of the column. The name opens the You screen (profile, preferences, sign out); so does the gear. */
export function UserPanel() {
  const user = useSessionStore((s) => s.user);
  const status = useSessionStore((s) => s.settings.status);
  const storedCustom = useSessionStore((s) => s.settings.custom_status);
  if (!user) return null;
  const custom = activeCustomStatus(storedCustom, Date.now());
  const customText = custom ? [custom.emoji_id ? '' : custom.emoji_name, custom.text].filter(Boolean).join(' ') : '';
  const name = user.global_name || user.username;
  const open = () => router.push('/you');

  return (
    <View style={styles.panel}>
      <Pressable accessibilityRole="button" accessibilityLabel="Account and status" onPress={open} style={({ pressed }) => [styles.id, pressed && styles.pressed]}>
        <Avatar user={user} size={34} />
        <View style={styles.copy}>
          <Text numberOfLines={1} style={styles.name}>
            {name}
          </Text>
          <Text numberOfLines={1} style={styles.sub}>
            {customText || STATUS_LABEL[status ?? 'online'] || 'Online'}
          </Text>
        </View>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="User settings" hitSlop={6} onPress={open} style={styles.gear}>
        <Ionicons name="settings-outline" size={22} color={theme.muted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { flexDirection: 'row', alignItems: 'center', gap: 4, marginHorizontal: 8, marginBottom: 8, padding: 6, borderRadius: metrics.panelRadius, backgroundColor: theme.raised, borderWidth: 1, borderColor: theme.hairline },
  id: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0, padding: 2, paddingRight: 6, borderRadius: 10 },
  pressed: { backgroundColor: theme.hover },
  copy: { flex: 1, minWidth: 0 },
  name: { color: theme.text, fontSize: 13, fontWeight: '600' },
  sub: { color: theme.subtle, fontSize: 11 },
  gear: { padding: 8 },
});
