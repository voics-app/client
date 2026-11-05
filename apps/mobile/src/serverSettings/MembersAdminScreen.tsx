import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { Avatar } from '../profile/Avatar';
import { useGuildPermissions } from '../servers/useGuildPermissions';
import { theme } from '../theme';
import { ListRow } from '../ui/ListRow';
import { MemberActionSheet } from './MemberActionSheet';
import { moderationRows, type ModerationRow } from './memberAdminModel';
import { PageGuard } from './PageGuard';

function Body({ guildId }: { guildId: string }) {
  const guild = useGuildStore((s) => s.guilds[guildId]);
  const members = useGuildStore((s) => s.members[guildId]);
  const me = useSessionStore((s) => s.user?.id);
  const perms = useGuildPermissions(guildId);
  const [query, setQuery] = useState('');
  const [target, setTarget] = useState<ModerationRow | null>(null);
  const [timedOutOnly, setTimedOutOnly] = useState(false);
  const rows = useMemo(() => (guild && me ? moderationRows(guild, perms, members, me, query, timedOutOnly) : []), [guild, perms, members, me, query, timedOutOnly]);

  return (
    <View style={styles.screen}>
      <TextInput
        accessibilityLabel="Search members"
        placeholder="Search members"
        placeholderTextColor={theme.subtle}
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.search}
      />
      <View style={styles.filters}>
        <Switch accessibilityLabel="Timed out only" value={timedOutOnly} onValueChange={setTimedOutOnly} trackColor={{ true: theme.accent }} />
        <Text style={styles.filterText}>Timed out only</Text>
      </View>
      <FlatList
        data={rows}
        keyExtractor={(row) => row.member.user.id}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <ListRow
            title={item.name}
            subtitle={item.subtitle}
            left={<Avatar user={item.member.user} size={36} />}
            {...(item.rights.any ? { onPress: () => setTarget(item), accessibilityLabel: `Moderate ${item.name}` } : {})}
          />
        )}
      />
      <MemberActionSheet guildId={guildId} member={target?.member ?? null} onClose={() => setTarget(null)} />
    </View>
  );
}

/** Server settings > Members: search the members and open the actions you may take on one (roles, nickname, timeout, kick, ban). */
export function MembersAdminScreen({ guildId }: { guildId: string }) {
  return (
    <PageGuard guildId={guildId} page="members" title="Members">
      <Body guildId={guildId} />
    </PageGuard>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.background },
  filters: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 8 },
  filterText: { color: theme.muted, fontSize: 14 },
  search: { margin: 12, paddingHorizontal: 12, height: 40, borderRadius: 10, backgroundColor: theme.raised, color: theme.text, fontSize: 15 },
});
