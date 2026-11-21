import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useMentionInboxStore } from '@discordy/core/application/stores/mentionInboxStore';
import { openMessage } from '../navigation/openMessage';
import { theme } from '../theme';
import { TextButton } from '../ui/controls';
import { EmptyState } from '../ui/EmptyState';
import { inboxSections, type InboxRow } from './inboxModel';
import { useChannelContentAccess } from '../safety/useChannelContentAccess';

function InboxItem({ row }: { row: InboxRow }) {
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open mention from ${row.author} in #${row.channelName}`}
        onPress={() => openMessage({ guildId: row.guildId, channelId: row.channelId, messageId: row.id })}
        style={({ pressed }) => [styles.open, pressed && styles.pressed]}
      >
        <Text numberOfLines={1} style={styles.meta}>
          <Text style={styles.author}>{row.author}</Text>
          {` in #${row.channelName}  ${row.time}`}
        </Text>
        <Text numberOfLines={2} style={styles.preview}>
          {row.preview}
        </Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`Mark mention from ${row.author} as read`} onPress={() => useMentionInboxStore.getState().remove(row.id)} style={styles.mark}>
        <Ionicons name="checkmark-circle-outline" size={24} color={theme.muted} />
      </Pressable>
    </View>
  );
}

/** Desktop's Mentions inbox: recent @mentions and replies across servers, grouped by server. Tap to jump to the message, the check marks one read. */
export function NotificationsScreen() {
  const { canShow } = useChannelContentAccess();
  const entries = useMentionInboxStore((s) => s.entries);
  const guilds = useGuildStore((s) => s.guilds);
  const channels = useGuildStore((s) => s.channels);
  const sections = useMemo(() => inboxSections(entries.filter((entry) => canShow(entry.channelId)), guilds, channels, Date.now()), [entries, guilds, channels, canShow]);

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerRight: () => (sections.length > 0 ? <TextButton label="Mark all read" onPress={() => useMentionInboxStore.getState().clear()} /> : null) }} />
      <SectionList
        sections={sections}
        keyExtractor={(row) => row.id}
        renderSectionHeader={({ section }) => (
          <Text accessibilityRole="header" style={styles.section}>
            {section.title}
          </Text>
        )}
        renderItem={({ item }) => <InboxItem row={item} />}
        ListEmptyComponent={<EmptyState icon="notifications-outline" title="You are all caught up" body="No recent mentions. Messages that mention you, your roles or @everyone, and replies to you, show up here." />}
        contentContainerStyle={styles.content}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.background },
  content: { paddingBottom: 24 },
  section: { color: theme.subtle, fontSize: 11, fontWeight: '600', letterSpacing: 0.66, textTransform: 'uppercase', paddingHorizontal: 16, paddingTop: 20, paddingBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: theme.hairline },
  open: { flex: 1, minHeight: 64, paddingLeft: 16, paddingVertical: 10 },
  pressed: { backgroundColor: theme.hover },
  meta: { color: theme.muted, fontSize: 13 },
  author: { color: theme.text, fontWeight: '700' },
  preview: { color: theme.text, fontSize: 15, marginTop: 2 },
  mark: { width: 52, minHeight: 64, alignItems: 'center', justifyContent: 'center' },
});
