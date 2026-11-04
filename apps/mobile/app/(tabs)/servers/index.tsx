import { router } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { serverRows } from '../../../src/servers/serverModel';
import { theme } from '../../../src/theme';

export default function ServersScreen() {
  const order = useGuildStore((s) => s.order);
  const guilds = useGuildStore((s) => s.guilds);
  const status = useSessionStore((s) => s.status);
  const rows = useMemo(() => serverRows({ order, guilds }), [order, guilds]);

  return (
    <FlatList
      style={styles.list}
      data={rows}
      keyExtractor={(row) => row.id}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{status === 'ready' ? 'You are not in any servers yet.' : 'Loading your servers...'}</Text>
        </View>
      }
      renderItem={({ item }) => (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push(`/servers/${item.id}`)}
          style={styles.row}
        >
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{item.name.slice(0, 1).toUpperCase()}</Text>
          </View>
          <Text style={styles.name}>{item.name}</Text>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { backgroundColor: theme.background },
  row: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  badge: { width: 44, height: 44, borderRadius: 14, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: theme.text, fontSize: 18, fontWeight: '700' },
  name: { color: theme.text, fontSize: 16, fontWeight: '600', flexShrink: 1 },
  empty: { padding: 32, alignItems: 'center' },
  emptyText: { color: theme.muted },
});
