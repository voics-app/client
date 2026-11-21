import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { openChat } from '../navigation/openChat';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useClosedDmStore } from '@discordy/core/application/stores/closedDmStore';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useNotificationSettingsStore } from '@discordy/core/application/stores/notificationSettingsStore';
import { useFavouriteFriendsStore, useReadStateStore, useRelationshipStore } from '@discordy/core/application/stores/peopleStores';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import { DM_SCOPE, isChannelMuted } from '@discordy/core/domain/notificationSettings';
import { isUnread } from '@discordy/core/domain/unread';
import type { User } from '@discordy/core/contracts/rest';
import { RelationshipType } from '@discordy/core/contracts/rest';
import { DmMenu } from '../dms/DmMenu';
import { dmListItems, dmRows, type DmRow } from '../dms/dmModel';
import { ProfileSheet } from '../profile/ProfileSheet';
import { Avatar } from '../profile/Avatar';
import { theme } from '../theme';
import { EmptyState } from '../ui/EmptyState';
import { RowSkeletons } from '../ui/Skeleton';
import { Badge } from './Badge';
import { ColumnHeader } from './ColumnHeader';

function DmItem({ row, lastMessageId, active, onMenu }: { row: DmRow; lastMessageId: string | undefined; active: boolean; onMenu(row: DmRow): void }) {
  const read = useReadStateStore((s) => s.byChannel[row.id]);
  const muted = useNotificationSettingsStore((s) => isChannelMuted(s.byScope[DM_SCOPE], row.id, Date.now()));
  const unread = !muted && isUnread(lastMessageId, read?.lastReadId);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${row.title}`}
      accessibilityState={{ selected: active }}
      onPress={() => openChat({ channelId: row.id })}
      onLongPress={() => onMenu(row)}
      delayLongPress={300}
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

function ActionRow({ icon, label, onPress, badge = 0 }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress(): void; badge?: number }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.action}>
      <View style={styles.actionIcon}>
        <Ionicons name={icon} size={20} color={theme.text} />
      </View>
      <Text style={styles.actionText}>{label}</Text>
      <Badge value={badge} noun="friend requests" />
    </Pressable>
  );
}

/** Desktop's HomeSidebar: Friends and New message, then pinned conversations and the rest, newest activity first. Long-press a conversation for its menu. */
export function DmColumn() {
  const channels = useGuildStore((s) => s.channels);
  const closed = useClosedDmStore((s) => s.closed);
  const relationships = useRelationshipStore((s) => s.byUser);
  const favouriteIds = useFavouriteFriendsStore((s) => s.ids);
  const status = useSessionStore((s) => s.status);
  const pins = useSessionStore((s) => s.settings.pinned_dm_channel_ids);
  const activeId = useUiStore((s) => (s.view.kind === 'home' ? s.view.channelId : null));
  const [menuRow, setMenuRow] = useState<DmRow | null>(null);
  const [profile, setProfile] = useState<User | null>(null);
  const items = useMemo(() => dmListItems(dmRows({ channels, closed, relationships }), pins ?? [], favouriteIds.filter((id) => relationships[id]?.type === RelationshipType.FRIEND)), [channels, closed, relationships, pins, favouriteIds]);
  const requests = useMemo(() => Object.values(relationships).filter((r) => r.type === RelationshipType.INCOMING).length, [relationships]);

  return (
    <>
      <ColumnHeader title="Direct messages" />
      <FlatList
        style={styles.list}
        contentContainerStyle={styles.content}
        data={items}
        keyExtractor={(item) => (item.kind === 'header' ? `header-${item.title}` : item.row.id)}
        ListHeaderComponent={
          <View>
            <ActionRow icon="people-outline" label="Friends" badge={requests} onPress={() => router.push('/friends')} />
            <ActionRow icon="create-outline" label="New message" onPress={() => router.push('/dms/new')} />
          </View>
        }
        ListEmptyComponent={status === 'ready' ? <EmptyState icon="chatbubble-ellipses-outline" title="No conversations yet" body="Start one with a friend or a group." /> : <RowSkeletons />}
        renderItem={({ item }) =>
          item.kind === 'header' ? (
            <Text accessibilityRole="header" style={styles.heading}>
              {item.title}
            </Text>
          ) : (
            <DmItem row={item.row} lastMessageId={channels[item.row.id]?.last_message_id ?? undefined} active={item.row.id === activeId} onMenu={setMenuRow} />
          )
        }
      />
      <DmMenu row={menuRow} onClose={() => setMenuRow(null)} onProfile={setProfile} />
      <ProfileSheet user={profile} onClose={() => setProfile(null)} />
    </>
  );
}

const styles = StyleSheet.create({
  list: { flex: 1 },
  content: { paddingHorizontal: 8, paddingTop: 8, paddingBottom: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, marginVertical: 1, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
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
  heading: { color: theme.subtle, fontSize: 11, fontWeight: '600', letterSpacing: 0.66, textTransform: 'uppercase', paddingHorizontal: 8, paddingTop: 14, paddingBottom: 4 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingHorizontal: 8, borderRadius: 8 },
  actionIcon: { width: 34, alignItems: 'center' },
  actionText: { flex: 1, color: theme.text, fontSize: 15, fontWeight: '600' },
  empty: { color: theme.subtle, fontSize: 13, padding: 16 },
});
