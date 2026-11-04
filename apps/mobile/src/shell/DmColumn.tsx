import { router } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useClosedDmStore } from '@discordy/core/application/stores/closedDmStore';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useNotificationSettingsStore } from '@discordy/core/application/stores/notificationSettingsStore';
import { useReadStateStore, useRelationshipStore } from '@discordy/core/application/stores/peopleStores';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import { DM_SCOPE, isChannelMuted } from '@discordy/core/domain/notificationSettings';
import { isUnread } from '@discordy/core/domain/unread';
import { dmRows, type DmRow } from '../dms/dmModel';
import { Avatar } from '../profile/Avatar';
import { theme } from '../theme';
import { Badge } from './Badge';
import { ColumnHeader } from './ColumnHeader';

function DmItem({ row, lastMessageId, active }: { row: DmRow; lastMessageId: string | undefined; active: boolean }) {
  const read = useReadStateStore((s) => s.byChannel[row.id]);
  const muted = useNotificationSettingsStore((s) => isChannelMuted(s.byScope[DM_SCOPE], row.id, Date.now()));
  const unread = !muted && isUnread(lastMessageId, read?.lastReadId);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${row.title}`}
      accessibilityState={{ selected: active }}
      onPress={() => router.push(`/dms/${row.id}`)}
      style={[styles.row, active && styles.rowActive, muted && styles.muted]}
    >
      {unread && <View testID="channel-unread" style={styles.unreadDot} />}
      {row.peer ? (
        <Avatar user={row.peer} size={34} />
      ) : (
        <View style={styles.group}>
          <Text style={styles.groupText}>#</Text>
        </View>
      )}
      <View style={styles.text}>
        <Text numberOfLines={1} style={[styles.title, (active || unread) && styles.titleOn, unread && styles.titleUnread]}>
          {row.title}
        </Text>
        <Text numberOfLines={1} style={styles.sub}>
          {row.group ? 'Group' : 'Direct message'}
          {row.private ? ' - private delivery' : ''}
        </Text>
      </View>
      <Badge value={read?.mentionCount ?? 0} />
    </Pressable>
  );
}

/** Desktop's HomeSidebar: the conversation list, newest activity first. */
export function DmColumn() {
  const channels = useGuildStore((s) => s.channels);
  const closed = useClosedDmStore((s) => s.closed);
  const relationships = useRelationshipStore((s) => s.byUser);
  const status = useSessionStore((s) => s.status);
  const activeId = useUiStore((s) => (s.view.kind === 'home' ? s.view.channelId : null));
  const rows = useMemo(() => dmRows({ channels, closed, relationships }), [channels, closed, relationships]);

  return (
    <>
      <ColumnHeader title="Direct messages" />
      <FlatList
        style={styles.list}
        contentContainerStyle={styles.content}
        data={rows}
        keyExtractor={(row) => row.id}
        ListEmptyComponent={<Text style={styles.empty}>{status === 'ready' ? 'No conversations yet.' : 'Loading your conversations...'}</Text>}
        renderItem={({ item }) => <DmItem row={item} lastMessageId={channels[item.id]?.last_message_id ?? undefined} active={item.id === activeId} />}
      />
    </>
  );
}

const styles = StyleSheet.create({
  list: { flex: 1 },
  content: { paddingHorizontal: 8, paddingTop: 8, paddingBottom: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, marginVertical: 1, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  rowActive: { backgroundColor: theme.accentSoft },
  muted: { opacity: 0.55 },
  unreadDot: { position: 'absolute', left: -8, top: 18, width: 4, height: 8, borderTopRightRadius: 4, borderBottomRightRadius: 4, backgroundColor: theme.text },
  text: { flex: 1 },
  title: { color: theme.subtle, fontSize: 15 },
  titleOn: { color: theme.text },
  titleUnread: { fontWeight: '600' },
  sub: { color: theme.subtle, fontSize: 11 },
  group: { width: 34, height: 34, borderRadius: 17, backgroundColor: theme.raised, alignItems: 'center', justifyContent: 'center' },
  groupText: { color: theme.text, fontSize: 16, fontWeight: '700' },
  empty: { color: theme.subtle, fontSize: 13, padding: 16 },
});
