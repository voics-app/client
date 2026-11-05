import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { roleColorCss } from '@discordy/core/domain/userMenuModel';

/** The colour of a member's highest coloured role, or undefined outside servers and for members without one. */
export function useRoleColor(guildId: string | undefined, userId: string): string | undefined {
  return useGuildStore((s) => {
    if (!guildId) return undefined;
    const guild = s.guilds[guildId];
    const member = s.members[guildId]?.[userId];
    if (!guild || !member) return undefined;
    const top = guild.roles.filter((r) => member.roles.includes(r.id) && r.color !== 0).sort((a, b) => b.position - a.position)[0];
    return top ? roleColorCss(top.color) : undefined;
  });
}
