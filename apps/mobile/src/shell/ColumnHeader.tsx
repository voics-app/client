import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { metrics, theme } from '../theme';

/** Desktop's `.guild-header`: the server (or "Direct messages") name, plus the bell that opens notifications. */
export function ColumnHeader({ title }: { title: string }) {
  return (
    <View style={styles.header}>
      <Text accessibilityRole="header" numberOfLines={1} style={styles.title}>
        {title}
      </Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Notifications" hitSlop={8} onPress={() => router.push('/notifications')} style={styles.bell}>
        <Ionicons name="notifications-outline" size={22} color={theme.muted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    height: metrics.headerHeight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.hairline,
    borderTopLeftRadius: metrics.columnRadius,
  },
  title: { flex: 1, color: theme.text, fontSize: 15, fontWeight: '600', letterSpacing: -0.15 },
  bell: { padding: 4 },
});
