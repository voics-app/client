import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { metrics, theme } from '../theme';

/** Desktop's `.guild-header`: the server (or "Direct messages") name, plus the bell that opens notifications. With `onPressTitle` the name is a button (the server menu). */
export function ColumnHeader({ title, onPressTitle }: { title: string; onPressTitle?: () => void }) {
  return (
    <View style={styles.header}>
      {onPressTitle ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`${title} server menu`} onPress={onPressTitle} style={styles.titleButton}>
          <Text numberOfLines={1} style={styles.title}>
            {title}
          </Text>
          <Ionicons name="chevron-down" size={14} color={theme.muted} />
        </Pressable>
      ) : (
        <Text accessibilityRole="header" numberOfLines={1} style={styles.title}>
          {title}
        </Text>
      )}
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
  titleButton: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, height: metrics.headerHeight },
  title: { flexShrink: 1, color: theme.text, fontSize: 15, fontWeight: '600', letterSpacing: -0.15 },
  bell: { padding: 4 },
});
