import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { getRuntime } from '../runtime';
import { useGuildPermissions } from '../servers/useGuildPermissions';
import { theme } from '../theme';
import { attempt } from '../ui/attempt';
import { Button } from '../ui/controls';
import { ListRow } from '../ui/ListRow';
import { PageGuard } from './PageGuard';
import { roleAccess, roleRows, toHex } from './roleModel';

function Body({ guildId }: { guildId: string }) {
  const guild = useGuildStore((s) => s.guilds[guildId]);
  const members = useGuildStore((s) => s.members[guildId]);
  const me = useSessionStore((s) => s.user?.id);
  const perms = useGuildPermissions(guildId);
  const [creating, setCreating] = useState(false);
  const access = useMemo(() => (guild && me ? roleAccess({ guild, perms, userId: me, memberRoleIds: members?.[me]?.roles ?? [] }) : null), [guild, perms, me, members]);
  const rows = useMemo(() => (guild && access ? roleRows(guild, Object.values(members ?? {}), access) : []), [guild, access, members]);
  if (!guild || !access) return null;

  const create = async () => {
    setCreating(true);
    const role = await attempt(() => getRuntime().api.createRole(guildId, { name: 'new role', permissions: '0', color: 0 }), 'Could not create role');
    setCreating(false);
    if (role) {
      useGuildStore.getState().upsertRole(guildId, role);
      router.push(`/servers/${guildId}/settings/roles/${role.id}`);
    }
  };

  return (
    <ScrollView style={styles.screen}>
      {access.canCreate && (
        <View style={styles.create}>
          <Button tone="primary" label="Create role" busy={creating} onPress={() => void create()} />
        </View>
      )}
      {rows.map(({ role, members: count, locked }) => (
        <ListRow
          key={role.id}
          title={role.id === guildId ? '@everyone' : `${role.unicode_emoji ? `${role.unicode_emoji} ` : ''}${role.name}`}
          subtitle={`${count} ${count === 1 ? 'member' : 'members'}${locked ? ' · above your highest role' : ''}`}
          left={<View style={[styles.dot, { backgroundColor: toHex(role.color) }]} />}
          right={locked ? <Ionicons name="lock-closed" size={14} color={theme.subtle} accessibilityLabel="Locked" /> : <Text style={styles.count}>{count}</Text>}
          onPress={() => router.push(`/servers/${guildId}/settings/roles/${role.id}`)}
          accessibilityLabel={`Role ${role.id === guildId ? '@everyone' : role.name}`}
        />
      ))}
    </ScrollView>
  );
}

/** Server settings > Roles: the role hierarchy with member counts, create, and a page per role. */
export function RolesScreen({ guildId }: { guildId: string }) {
  return (
    <PageGuard guildId={guildId} page="roles" title="Roles">
      <Body guildId={guildId} />
    </PageGuard>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.background },
  create: { padding: 16 },
  dot: { width: 14, height: 14, borderRadius: 7 },
  count: { color: theme.subtle, fontSize: 13 },
});
