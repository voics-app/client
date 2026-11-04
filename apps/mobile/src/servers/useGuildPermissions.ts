import { useMemo } from 'react';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { computeBasePermissions } from '@discordy/core/domain/permissions';

/** The signed-in user's guild-level permissions (owner and administrator included), as the desktop client computes them; 0 while the server is not loaded. */
export function useGuildPermissions(guildId: string): bigint {
  const guild = useGuildStore((s) => s.guilds[guildId]);
  const members = useGuildStore((s) => s.members[guildId]);
  const me = useSessionStore((s) => s.user?.id);
  return useMemo(() => {
    if (!guild || !me) return 0n;
    return computeBasePermissions({ guildId, ownerId: guild.owner_id, userId: me, memberRoleIds: members?.[me]?.roles ?? [], roles: guild.roles });
  }, [guildId, guild, members, me]);
}
