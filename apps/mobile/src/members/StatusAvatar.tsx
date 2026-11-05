import { StyleSheet, View } from 'react-native';
import type { User } from '@discordy/core/contracts/rest';
import { Avatar } from '../profile/Avatar';
import { theme } from '../theme';

const COLORS: Record<string, string> = { online: theme.success, idle: '#f0b232', dnd: theme.danger };

/** An avatar with the presence dot on its corner; offline and invisible show a hollow grey dot. `ring` is the colour behind the avatar, so the dot's border blends in. */
export function StatusAvatar({ user, status, size, ring = theme.surface }: { user: Pick<User, 'id' | 'avatar' | 'username' | 'global_name'>; status: string; size: number; ring?: string }) {
  const color = COLORS[status];
  return (
    <View style={{ width: size, height: size }}>
      <Avatar user={user} size={size} />
      <View testID={`status-${status}`} style={[styles.dot, { borderColor: ring }, color ? { backgroundColor: color } : styles.offline]} accessibilityLabel={`Status ${status}`} />
    </View>
  );
}

const styles = StyleSheet.create({
  dot: { position: 'absolute', right: -2, bottom: -2, width: 12, height: 12, borderRadius: 6, borderWidth: 2 },
  offline: { backgroundColor: theme.subtle },
});
