import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { getRuntime } from '../runtime';
import { useGuildPermissions } from '../servers/useGuildPermissions';
import { theme } from '../theme';
import { attempt } from '../ui/attempt';
import { Button } from '../ui/controls';
import { ListRow } from '../ui/ListRow';
import { hierarchyList, reorderPositions } from '@discordy/core/domain/roleManagement';
import { PageGuard } from './PageGuard';
import { moveRole } from './roleOrderActions';
import { roleAccess, roleRows, toHex } from './roleModel';

function Body({ guildId }: { guildId: string }) {
  const guild = useGuildStore((s) => s.guilds[guildId]);
  const members = useGuildStore((s) => s.members[guildId]);
  const me = useSessionStore((s) => s.user?.id);
  const perms = useGuildPermissions(guildId);
  const [creating, setCreating] = useState(false);
  const [reordering, setReordering] = useState(false);
  const access = useMemo(() => (guild && me ? roleAccess({ guild, perms, userId: me, memberRoleIds: members?.[me]?.roles ?? [] }) : null), [guild, perms, me, members]);
  const rows = useMemo(() => (guild && access ? roleRows(guild, Object.values(members ?? {}), access) : []), [guild, access, members]);
  if (!guild || !access) return null;
  const hierarchy = hierarchyList(guild.roles, guildId);

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
      <View style={styles.create}>
        <Button label={reordering ? 'Done reordering' : 'Reorder'} onPress={() => setReordering((r) => !r)} />
      </View>
      {rows.map(({ role, members: count, locked }) => (
        <ListRow
          key={role.id}
          title={role.id === guildId ? '@everyone' : `${role.unicode_emoji ? `${role.unicode_emoji} ` : ''}${role.name}`}
          subtitle={`${count} ${count === 1 ? 'member' : 'members'}${locked ? ' · above your highest role' : ''}`}
          left={<View style={[styles.dot, { backgroundColor: toHex(role.color) }]} />}
          right={
            reordering && role.id !== guildId ? (
              <View style={styles.steps}>
                {([-1, 1] as const).map((direction) => {
                  const off = locked || reorderPositions(hierarchy, role.id, hierarchy.findIndex((r) => r.id === role.id) + direction, access.actorRank, access.isOwner).length === 0;
                  return (
                    <Pressable key={direction} accessibilityRole="button" accessibilityLabel={`Move ${role.name} ${direction === -1 ? 'up' : 'down'}`} accessibilityState={{ disabled: off }} disabled={off} onPress={() => void moveRole(guildId, role.id, direction, access)} style={[styles.step, off && styles.stepOff]}>
                      <Ionicons name={direction === -1 ? 'chevron-up' : 'chevron-down'} size={20} color={theme.text} />
                    </Pressable>
                  );
                })}
              </View>
            ) : locked ? (
              <Ionicons name="lock-closed" size={14} color={theme.subtle} accessibilityLabel="Locked" />
            ) : (
              <Text style={styles.count}>{count}</Text>
            )
          }
          {...(reordering ? {} : { onPress: () => router.push(`/servers/${guildId}/settings/roles/${role.id}`), accessibilityLabel: `Role ${role.id === guildId ? '@everyone' : role.name}` })}
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
  steps: { flexDirection: 'row' },
  step: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  stepOff: { opacity: 0.3 },
  count: { color: theme.subtle, fontSize: 13 },
});
