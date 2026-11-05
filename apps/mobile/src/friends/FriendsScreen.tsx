import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { usePresenceStore, useRelationshipStore } from '@discordy/core/application/stores/peopleStores';
import { RelationshipType, type Relationship } from '@discordy/core/contracts/rest';
import type { FriendsTab } from '@discordy/core/domain/friendsModel';
import { StatusAvatar } from '../members/StatusAvatar';
import { Avatar } from '../profile/Avatar';
import { ProfileSheet } from '../profile/ProfileSheet';
import { theme } from '../theme';
import { Field, TextButton } from '../ui/controls';
import { EmptyState } from '../ui/EmptyState';
import { AddFriendForm } from './AddFriendForm';
import { acceptRequest, removeRelationship } from './friendActions';
import { emptyFriendsText, FRIEND_TABS, friendsList, type FriendItem } from './friendsListModel';
import { FriendSheet } from './FriendSheet';

function IconAction({ name, label, color, onPress }: { name: keyof typeof Ionicons.glyphMap; label: string; color: string; onPress(): void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.iconAction}>
      <Ionicons name={name} size={22} color={color} />
    </Pressable>
  );
}

function FriendRow({ item, onOpen }: { item: FriendItem; onOpen(rel: Relationship): void }) {
  const { rel } = item;
  const user = rel.user;
  const actions =
    rel.type === RelationshipType.INCOMING ? (
      <>
        <IconAction name="checkmark-circle" label={`Accept ${item.name}`} color={theme.success} onPress={() => void acceptRequest(rel.id)} />
        <IconAction name="close-circle" label={`Decline ${item.name}`} color={theme.danger} onPress={() => void removeRelationship(rel.id, 'Could not decline the request')} />
      </>
    ) : rel.type === RelationshipType.OUTGOING ? (
      <IconAction name="close-circle" label={`Cancel request to ${item.name}`} color={theme.danger} onPress={() => void removeRelationship(rel.id, 'Could not cancel the request')} />
    ) : rel.type === RelationshipType.BLOCKED ? (
      <TextButton label="Unblock" accessibilityLabel={`Unblock ${item.name}`} onPress={() => void removeRelationship(rel.id, 'Could not unblock')} />
    ) : null;
  return (
    <View style={styles.row}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${item.name}, ${item.subtitle}`} onPress={() => onOpen(rel)} style={({ pressed }) => [styles.person, pressed && styles.pressed]}>
        {item.status ? <StatusAvatar user={user} status={item.status} size={40} /> : <Avatar user={user} size={40} />}
        <View style={styles.copy}>
          <Text numberOfLines={1} style={styles.name}>
            {item.name}
          </Text>
          <Text numberOfLines={1} style={styles.sub}>
            {item.subtitle}
          </Text>
        </View>
      </Pressable>
      {actions}
    </View>
  );
}

/** Desktop's Friends page: Online, All, Pending (accept, decline, cancel), Blocked (unblock) and Add friend by username. Tap a person for message, profile, remove and block. */
export function FriendsScreen() {
  const byUser = useRelationshipStore((s) => s.byUser);
  const presence = usePresenceStore((s) => s.byUser);
  const [tab, setTab] = useState<FriendsTab>('online');
  const [query, setQuery] = useState('');
  const [menu, setMenu] = useState<Relationship | null>(null);
  const [profile, setProfile] = useState<Relationship | null>(null);
  const all = useMemo(() => Object.values(byUser), [byUser]);
  const list = useMemo(() => friendsList(all, presence, tab === 'add' ? 'online' : tab, query), [all, presence, tab, query]);

  return (
    <View style={styles.screen}>
      <View style={styles.tabBar}>
        {/* The list tabs scroll when the screen is narrow; Add friend stays pinned at the right edge so it is never pushed off. */}
        <ScrollView testID="friend-tabs" horizontal showsHorizontalScrollIndicator={false} style={styles.tabScroll} contentContainerStyle={styles.tabs}>
          {FRIEND_TABS.filter((t) => t.id !== 'add').map((t) => {
            const count = t.id === 'add' ? 0 : list.counts[t.id];
            const text = count > 0 ? `${t.label} ${count}` : t.label;
            return (
              <Pressable key={t.id} accessibilityRole="tab" accessibilityLabel={text} accessibilityState={{ selected: tab === t.id }} onPress={() => setTab(t.id)} style={[styles.tab, tab === t.id && styles.tabOn]}>
                <Text style={[styles.tabText, tab === t.id && styles.tabTextOn]}>{text}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <Pressable accessibilityRole="tab" accessibilityLabel="Add friend" accessibilityState={{ selected: tab === 'add' }} onPress={() => setTab('add')} style={[styles.addTab, tab === 'add' && styles.tabOn]}>
          <Ionicons name="person-add-outline" size={20} color={tab === 'add' ? theme.text : theme.muted} />
        </Pressable>
      </View>
      {tab === 'add' ? (
        <AddFriendForm />
      ) : (
        <>
          <View style={styles.search}>
            <Field label="Search" value={query} onChangeText={setQuery} placeholder="Search friends" />
          </View>
          <FlatList
            data={list.entries}
            keyExtractor={(e) => (e.kind === 'heading' ? e.title : e.rel.id)}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={<EmptyState icon="people-outline" title={tab === 'pending' ? 'No pending requests' : tab === 'blocked' ? 'Nobody blocked' : 'No friends here'} body={emptyFriendsText(tab, query)} />}
            renderItem={({ item }) =>
              item.kind === 'heading' ? (
                <Text accessibilityRole="header" style={styles.heading}>
                  {item.title.toUpperCase()}
                </Text>
              ) : (
                <FriendRow item={item} onOpen={setMenu} />
              )
            }
          />
        </>
      )}
      <FriendSheet rel={menu} onClose={() => setMenu(null)} onMessage={(id) => router.push(`/dms/${id}`)} onProfile={setProfile} />
      <ProfileSheet user={profile?.user ?? null} onClose={() => setProfile(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.background },
  tabBar: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: theme.hairline, paddingRight: 12 },
  tabScroll: { flex: 1 },
  tabs: { paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  addTab: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.raised, alignItems: 'center', justifyContent: 'center' },
  tab: { minHeight: 44, paddingHorizontal: 14, borderRadius: 22, backgroundColor: theme.raised, alignItems: 'center', justifyContent: 'center' },
  tabOn: { backgroundColor: theme.accentSoft, borderWidth: 1, borderColor: theme.accent },
  tabText: { color: theme.muted, fontSize: 14, fontWeight: '600' },
  tabTextOn: { color: theme.text },
  search: { paddingHorizontal: 16, paddingTop: 12 },
  heading: { color: theme.subtle, fontSize: 11, fontWeight: '600', letterSpacing: 0.66, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', paddingRight: 8 },
  person: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingHorizontal: 16, paddingVertical: 8 },
  pressed: { backgroundColor: theme.hover },
  copy: { flex: 1 },
  name: { color: theme.text, fontSize: 16 },
  sub: { color: theme.subtle, fontSize: 13, marginTop: 1 },
  iconAction: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
