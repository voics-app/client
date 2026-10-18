import { useMemo } from 'react';
import { useGuildStore } from '@renderer/application/stores/guildStore';
import { useSessionStore } from '@renderer/application/stores/sessionStore';
import { ALL_PERMISSIONS } from '@shared/contracts/permissions';
import { computeBasePermissions, computeChannelPermissions, hasPermission } from '@renderer/domain/permissions';

/** Guild-level permissions of the current user (all bits in DMs). */
export function useGuildPermissions(guildId: string | null | undefined): bigint {
  const guild = useGuildStore((s) => (guildId ? s.guilds[guildId] : undefined));
  const member = useGuildStore((s) => (guildId ? s.members[guildId] : undefined));
  const me = useSessionStore((s) => s.user?.id);
  return useMemo(() => {
    if (!guildId || !guild || !me) return ALL_PERMISSIONS;
    return computeBasePermissions({
      guildId,
      ownerId: guild.owner_id,
      userId: me,
      memberRoleIds: member?.[me]?.roles ?? [],
      roles: guild.roles,
    });
  }, [guildId, guild, member, me]);
}

/** Channel-level permissions including overwrites. */
export function useChannelPermissions(channelId: string | null | undefined): bigint {
  const channel = useGuildStore((s) => (channelId ? s.channels[channelId] : undefined));
  const guildId = channel?.guild_id ?? null;
  const guild = useGuildStore((s) => (guildId ? s.guilds[guildId] : undefined));
  const member = useGuildStore((s) => (guildId ? s.members[guildId] : undefined));
  const parent = useGuildStore((s) => (channel?.parent_id ? s.channels[channel.parent_id] : undefined));
  const me = useSessionStore((s) => s.user?.id);
  return useMemo(() => {
    if (!channel || !guildId || !guild || !me) return ALL_PERMISSIONS;
    const ctx = { guildId, ownerId: guild.owner_id, userId: me, memberRoleIds: member?.[me]?.roles ?? [], roles: guild.roles };
    const inherited = channel.type >= 10 && channel.type <= 12 ? (parent?.permission_overwrites ?? []) : (channel.permission_overwrites ?? []);
    return computeChannelPermissions(ctx, inherited);
  }, [channel, guildId, guild, member, me, parent]);
}

export const can = (permissions: bigint, bit: bigint): boolean => hasPermission(permissions, bit);
