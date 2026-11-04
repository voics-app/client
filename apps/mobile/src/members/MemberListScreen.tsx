import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useMemberGroupStore } from '@discordy/core/application/stores/memberGroupStore';
import { usePresenceStore } from '@discordy/core/application/stores/peopleStores';
import { GatewayOp } from '@discordy/core/contracts/gateway';
import type { User } from '@discordy/core/contracts/rest';
import { ProfileSheet } from '../profile/ProfileSheet';
import { getRuntime } from '../runtime';
import { theme } from '../theme';
import { Notice } from '../ui/controls';
import { memberRows, type MemberRow } from './memberListModel';
import { MemberRowView } from './MemberRowView';

const EMPTY: readonly string[] = [];
const SEARCH_DEBOUNCE_MS = 250;

function requestMembers(guildId: string, query: string, limit: number, nonce: string) {
  getRuntime().gateway.send(GatewayOp.REQUEST_GUILD_MEMBERS, { guild_id: guildId, query, limit, presences: true, nonce });
}

function GroupHeader({ row, onToggle }: { row: Extract<MemberRow, { kind: 'header' }>; onToggle(id: string): void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${row.title} ${row.count}`}
      accessibilityState={{ expanded: !row.collapsed }}
      onPress={() => onToggle(row.id)}
      style={styles.header}
    >
      <Ionicons name={row.collapsed ? 'chevron-forward' : 'chevron-down'} size={12} color={theme.subtle} />
      <Text style={styles.headerText}>{`${row.title.toUpperCase()} - ${row.count}`}</Text>
    </Pressable>
  );
}

/** Desktop's member list for one server: grouped by role then online and offline, with avatars, status and search. Tapping a person opens their profile. */
export function MemberListScreen({ guildId }: { guildId: string }) {
  const guild = useGuildStore((s) => s.guilds[guildId]);
  const members = useGuildStore((s) => s.members[guildId]);
  const presence = usePresenceStore((s) => s.byUser);
  const collapsedIds = useMemberGroupStore((s) => s.collapsed[guildId]) ?? EMPTY;
  const [query, setQuery] = useState('');
  const [profile, setProfile] = useState<User | null>(null);
  const collapsed = useMemo(() => new Set(collapsedIds), [collapsedIds]);
  const needle = query.trim();

  useEffect(() => requestMembers(guildId, '', 100, `members-${guildId}`), [guildId]);
  useEffect(() => {
    if (!needle) return;
    const timer = setTimeout(() => requestMembers(guildId, needle, 50, `msearch-${guildId}`), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [guildId, needle]);

  const rows = useMemo(
    () => (guild ? memberRows({ members, roles: guild.roles, guildId, presence, collapsed, query }) : []),
    [guild, members, guildId, presence, collapsed, query],
  );

  if (!guild) return <Notice>This server is not available.</Notice>;
  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: 'Members' }} />
      <View style={styles.search}>
        <Ionicons name="search" size={16} color={theme.subtle} />
        <TextInput
          accessibilityLabel="Search members"
          placeholder="Search members"
          placeholderTextColor={theme.subtle}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
        />
      </View>
      <FlatList
        data={rows}
        keyExtractor={(row) => row.key}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={<Notice>No members loaded yet.</Notice>}
        ListFooterComponent={needle !== '' && rows.length === 1 ? <Notice>No members match.</Notice> : undefined}
        renderItem={({ item }) =>
          item.kind === 'header' ? (
            <GroupHeader row={item} onToggle={(id) => useMemberGroupStore.getState().toggle(guildId, id)} />
          ) : (
            <MemberRowView member={item.member} guild={guild} onPress={() => setProfile(item.member.user)} />
          )
        }
      />
      <ProfileSheet user={profile} guildId={guildId} onClose={() => setProfile(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.surface },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, margin: 12, paddingHorizontal: 12, height: 40, borderRadius: 10, backgroundColor: theme.raised },
  input: { flex: 1, color: theme.text, fontSize: 15 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingHorizontal: 16, marginTop: 8 },
  headerText: { color: theme.subtle, fontSize: 11, fontWeight: '600', letterSpacing: 0.66 },
});
