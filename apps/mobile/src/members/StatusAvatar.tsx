import { StyleSheet, View } from 'react-native';
import type { User } from '@discordy/core/contracts/rest';
import { Avatar } from '../profile/Avatar';
import { theme } from '../theme';

const COLORS: Record<string, string> = { online: theme.success, idle: '#f0b232', dnd: theme.danger };

/** An avatar with the presence dot on its corner; offline and invisible show a hollow grey dot. */
export function StatusAvatar({ user, status, size }: { user: Pick<User, 'id' | 'avatar' | 'username' | 'global_name'>; status: string; size: number }) {
  const color = COLORS[status];
  return (
    <View style={{ width: size, height: size }}>
      <Avatar user={user} size={size} />
      <View testID={`status-${status}`} style={[styles.dot, color ? { backgroundColor: color } : styles.offline]} accessibilityLabel={`Status ${status}`} />
    </View>
  );
}

const styles = StyleSheet.create({
  dot: { position: 'absolute', right: -2, bottom: -2, width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: theme.surface },
  offline: { backgroundColor: theme.subtle },
});
