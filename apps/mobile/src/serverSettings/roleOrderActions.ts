import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { applyPositions, hierarchyList, reorderPositions } from '@discordy/core/domain/roleManagement';
import { getRuntime } from '../runtime';
import { attempt } from '../ui/attempt';
import type { RoleAccess } from './roleModel';

/**
 * Moves a role one place up (-1) or down (1) in the hierarchy, by desktop's rules: roles at or above your own never move, and none lands above you.
 * The change shows at once and the old order comes back when the server refuses.
 */
export async function moveRole(guildId: string, roleId: string, direction: -1 | 1, access: Pick<RoleAccess, 'actorRank' | 'isOwner'>): Promise<void> {
  const guild = useGuildStore.getState().guilds[guildId];
  if (!guild) return;
  const list = hierarchyList(guild.roles, guildId);
  const index = list.findIndex((r) => r.id === roleId);
  const changes = reorderPositions(list, roleId, index + direction, access.actorRank, access.isOwner);
  if (changes.length === 0) return;
  const before = guild.roles;
  for (const role of applyPositions(guild.roles, changes)) useGuildStore.getState().upsertRole(guildId, role);
  const saved = await attempt(() => getRuntime().api.reorderRoles(guildId, changes), 'Could not reorder roles');
  const restore = saved ?? before;
  for (const role of restore) useGuildStore.getState().upsertRole(guildId, role);
}
