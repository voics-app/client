import type { GuildMeta } from '@discordy/core/application/stores/guildStore';
import type { GuildMember } from '@discordy/core/contracts/rest';
import { memberCapabilities } from '@discordy/core/domain/memberModeration';
import { DEFAULT_MEMBER_FILTER, filterMembers, isTimedOut } from '@discordy/core/domain/moderationTools';
import { memberName } from '../members/memberListModel';

/** Rows shown at once, as on desktop; search narrows the rest. */
export const MAX_ROWS = 200;

export interface ModerationRights {
  kick: boolean;
  ban: boolean;
  /** Add and remove roles: Manage Roles, and only roles below your highest. */
  roles: boolean;
  timeout: boolean;
  /** Change the nickname: your own with Change Nickname, someone else's with Manage Nicknames. */
  nickname: boolean;
  /** At least one of the above, so the member sheet has something to offer. */
  any: boolean;
}

/** What the user may do to one member: the same permission and role-hierarchy rules as the desktop member menu (never the owner, only people below your highest role; your own nickname). */
export function moderationRights(guild: GuildMeta, perms: bigint, me: GuildMember | undefined, meId: string, target: GuildMember): ModerationRights {
  const caps = memberCapabilities({
    perms,
    ownerId: guild.owner_id,
    roles: guild.roles,
    actor: { userId: meId, roleIds: me?.roles ?? [] },
    target: { userId: target.user.id, roleIds: target.roles },
    inVoice: false,
  });
  const rights = { kick: caps.canKick, ban: caps.canBan, roles: caps.canManageRoles, timeout: caps.canTimeout, nickname: caps.canEditNickname };
  return { ...rights, any: Object.values(rights).some(Boolean) };
}

export interface ModerationRow {
  member: GuildMember;
  name: string;
  subtitle: string;
  rights: ModerationRights;
}

/** The searchable member list of the Members page, each row with what the user may do to that person. */
export function moderationRows(guild: GuildMeta, perms: bigint, members: Record<string, GuildMember> | undefined, meId: string, query: string, timedOutOnly = false): ModerationRow[] {
  const me = members?.[meId];
  return filterMembers(Object.values(members ?? {}), { ...DEFAULT_MEMBER_FILTER, query, timedOutOnly }, memberName)
    .slice(0, MAX_ROWS)
    .map((member) => ({
      member,
      name: memberName(member),
      subtitle: `${member.user.username}${isTimedOut(member) ? ' · timed out' : ''} · joined ${new Date(member.joined_at).toLocaleDateString()}`,
      rights: moderationRights(guild, perms, me, meId, member),
    }));
}
