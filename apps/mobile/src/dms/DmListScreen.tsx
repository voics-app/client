import { router } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useClosedDmStore } from '@discordy/core/application/stores/closedDmStore';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useRelationshipStore } from '@discordy/core/application/stores/peopleStores';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { formatMessageTime } from '@discordy/core/domain/messageTime';
import { Avatar } from '../profile/Avatar';
import { theme } from '../theme';
import { dmRows } from './dmModel';

/** The user's 1:1 and group conversations, newest activity first. */
export function DmListScreen() {
  const channels = useGuildStore((s) => s.channels);
  const closed = useClosedDmStore((s) => s.closed);
  const relationships = useRelationshipStore((s) => s.byUser);
  const status = useSessionStore((s) => s.status);
  const rows = useMemo(() => dmRows({ channels, closed, relationships }), [channels, closed, relationships]);

  return (
    <FlatList
      style={styles.list}
      data={rows}
      keyExtractor={(row) => row.id}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{status === 'ready' ? 'No conversations yet.' : 'Loading your conversations...'}</Text>
        </View>
      }
      renderItem={({ item }) => (
        <Pressable accessibilityRole="button" accessibilityLabel={`Open ${item.title}`} onPress={() => router.push(`/dms/${item.id}`)} style={styles.row}>
          {item.peer ? <Avatar user={item.peer} size={44} /> : <GroupBadge />}
          <View style={styles.text}>
            <Text style={styles.title} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={styles.sub} numberOfLines={1}>
              {item.group ? 'Group' : 'Direct message'}
              {item.private ? ' - private delivery' : ''}
            </Text>
          </View>
          <Text style={styles.time}>{formatMessageTime(new Date(item.activityAt).toISOString(), Date.now())}</Text>
        </Pressable>
      )}
    />
  );
}

function GroupBadge() {
  return (
    <View style={styles.group}>
      <Text style={styles.groupText}>#</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { backgroundColor: theme.background },
  row: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  text: { flex: 1 },
  title: { color: theme.text, fontSize: 16, fontWeight: '600' },
  sub: { color: theme.muted, fontSize: 12, marginTop: 2 },
  time: { color: theme.muted, fontSize: 11 },
  group: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.surface, alignItems: 'center', justifyContent: 'center' },
  groupText: { color: theme.text, fontSize: 18, fontWeight: '700' },
  empty: { padding: 32, alignItems: 'center' },
  emptyText: { color: theme.muted },
});
