import { useGuildStore } from '@renderer/application/stores/guildStore';
import type { User } from '@discordy/core/contracts/rest';

export function displayName(user: Pick<User, 'username' | 'global_name'>, nick?: string | null): string {
  // Gateway events can carry partial users ({ id } only), so never return undefined.
  return nick || user.global_name || user.username || 'Unknown user';
}

/** Display name honouring the guild nickname. */
export function useMemberName(guildId: string | null | undefined, user: Pick<User, 'id' | 'username' | 'global_name'>): string {
  const nick = useGuildStore((s) => (guildId ? s.members[guildId]?.[user.id]?.nick : null));
  return displayName(user, nick);
}

/** Highest coloured role of a member, used for name colour. */
export function useRoleColor(guildId: string | null | undefined, userId: string): string | undefined {
  return useGuildStore((s) => {
    if (!guildId) return undefined;
    const guild = s.guilds[guildId];
    const member = s.members[guildId]?.[userId];
    if (!guild || !member) return undefined;
    const top = guild.roles.filter((r) => member.roles.includes(r.id) && r.color !== 0).sort((a, b) => b.position - a.position)[0];
    return top ? `#${top.color.toString(16).padStart(6, '0')}` : undefined;
  });
}
