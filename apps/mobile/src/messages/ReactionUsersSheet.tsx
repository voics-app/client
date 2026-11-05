import { useEffect, useState } from 'react';
import { FlatList, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { reactionKey, useMessageStore } from '@discordy/core/application/stores/messageStore';
import { BRAND } from '../brand';
import { Avatar } from '../profile/Avatar';
import { getRuntime } from '../runtime';
import { BottomSheet } from '../sheets/BottomSheet';
import { useLastValue } from '../sheets/useLastValue';
import { theme } from '../theme';

type Who = { id: string; username?: string; global_name?: string | null; avatar?: string | null };

export interface ReactionTarget {
  channelId: string;
  messageId: string;
  /** The emoji tab to open on (its `reactionKey`). */
  emoji: string;
}

/** Everyone who reacted to a message, one tab per emoji. */
export function ReactionUsersSheet({ target: shown, onClose }: { target: ReactionTarget | null; onClose(): void }) {
  const target = useLastValue(shown);
  const [picked, setPicked] = useState<string | null>(null);
  const [users, setUsers] = useState<Who[] | null>(null);
  const reactions = useMessageStore((s) => (target ? s.timelines[target.channelId]?.byId[target.messageId]?.reactions : undefined)) ?? [];
  const current = picked ?? target?.emoji ?? '';
  const count = reactions.find((r) => reactionKey(r.emoji) === current)?.count ?? 0;

  useEffect(() => setPicked(null), [target?.messageId, target?.emoji]);
  useEffect(() => {
    if (!target || !current) return;
    let live = true;
    setUsers(null);
    getRuntime()
      .api.reactionUsers(target.channelId, target.messageId, current)
      .then((list) => live && setUsers(list))
      .catch(() => live && setUsers([]));
    return () => {
      live = false;
    };
  }, [target, current, count]);

  return (
    <BottomSheet visible={shown !== null} onClose={onClose} label="Reactions" tall>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll} contentContainerStyle={styles.tabs}>
        {reactions.map((r) => {
          const key = reactionKey(r.emoji);
          return (
            <Pressable key={key} accessibilityRole="tab" accessibilityState={{ selected: key === current }} accessibilityLabel={`${r.emoji.name ?? 'emoji'} ${r.count}`} onPress={() => setPicked(key)} style={[styles.tab, key === current && styles.tabOn]}>
              {r.emoji.id ? <Image source={{ uri: `${BRAND.cdnUrl}/emojis/${r.emoji.id}.${r.emoji.animated ? 'gif' : 'png'}` }} style={styles.custom} /> : <Text style={styles.glyph}>{r.emoji.name}</Text>}
              <Text style={styles.count}>{r.count}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {users === null ? (
        <Text style={styles.empty}>Loading...</Text>
      ) : users.length === 0 ? (
        <Text style={styles.empty}>No reactions.</Text>
      ) : (
        <FlatList
          data={users}
          keyExtractor={(u) => u.id}
          renderItem={({ item }) => (
            <View style={styles.person}>
              <Avatar user={{ id: item.id, avatar: item.avatar ?? null, username: item.username ?? '?', global_name: item.global_name ?? null }} size={36} />
              <Text style={styles.name}>{item.global_name || item.username || 'Unknown user'}</Text>
            </View>
          )}
        />
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  tabsScroll: { flexGrow: 0 },
  tabs: { gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 14, borderRadius: 12, backgroundColor: theme.raised },
  tabOn: { backgroundColor: theme.accentSoft },
  glyph: { fontSize: 20 },
  custom: { width: 22, height: 22 },
  count: { color: theme.text, fontSize: 14, fontWeight: '600' },
  empty: { color: theme.muted, textAlign: 'center', padding: 24 },
  person: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingHorizontal: 16 },
  name: { color: theme.text, fontSize: 16 },
});
