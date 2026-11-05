import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { threadsOf } from '@discordy/core/domain/threads';
import { theme } from '../theme';
import { Notice } from '../ui/controls';

/** The threads of a channel this app knows about: active first, newest first, archived ones marked. Opening one shows it as a chat. The server has no list route yet (api#34), so threads that appeared while the app was closed arrive with the next connection. */
export function ThreadsScreen({ channelId }: { channelId: string }) {
  const channels = useGuildStore((s) => s.channels);
  const channel = channels[channelId];
  const threads = useMemo(() => threadsOf(channels, channelId), [channels, channelId]);
  const guildId = channel?.guild_id;

  if (!channel || !guildId) return <Notice>This channel is not available.</Notice>;
  return (
    <View style={styles.screen}>
      <FlatList
        data={threads}
        keyExtractor={(t) => t.id}
        ListEmptyComponent={<Notice>No threads yet. Long-press a message and choose Create Thread.</Notice>}
        renderItem={({ item }) => {
          const archived = item.thread_metadata?.archived === true;
          const count = item.message_count ?? 0;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Open thread ${item.name ?? 'thread'}${archived ? ', archived' : ''}`}
              onPress={() => router.push(`/servers/${guildId}/${item.id}`)}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            >
              <Ionicons name="chatbubbles-outline" size={22} color={archived ? theme.subtle : theme.text} />
              <View style={styles.copy}>
                <Text numberOfLines={1} style={[styles.name, archived && styles.archived]}>
                  {item.name ?? 'thread'}
                </Text>
                <Text style={styles.sub}>{`${count} ${count === 1 ? 'message' : 'messages'}${archived ? ' - Archived' : ''}`}</Text>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.background },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 60, paddingHorizontal: 16 },
  pressed: { backgroundColor: theme.hover },
  copy: { flex: 1 },
  name: { color: theme.text, fontSize: 16 },
  archived: { color: theme.subtle },
  sub: { color: theme.subtle, fontSize: 13, marginTop: 1 },
});
