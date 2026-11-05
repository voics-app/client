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
}

/** What the user may do to one member: the same permission and role-hierarchy rules as the desktop member menu (never yourself, never the owner, only people below your highest role). */
export function moderationRights(guild: GuildMeta, perms: bigint, me: GuildMember | undefined, meId: string, target: GuildMember): ModerationRights {
  const caps = memberCapabilities({
    perms,
    ownerId: guild.owner_id,
    roles: guild.roles,
    actor: { userId: meId, roleIds: me?.roles ?? [] },
    target: { userId: target.user.id, roleIds: target.roles },
    inVoice: false,
  });
  return { kick: caps.canKick, ban: caps.canBan };
}

export interface ModerationRow {
  member: GuildMember;
  name: string;
  subtitle: string;
  rights: ModerationRights;
}

/** The searchable member list of the Members page, each row with what the user may do to that person. */
export function moderationRows(guild: GuildMeta, perms: bigint, members: Record<string, GuildMember> | undefined, meId: string, query: string): ModerationRow[] {
  const me = members?.[meId];
  return filterMembers(Object.values(members ?? {}), { ...DEFAULT_MEMBER_FILTER, query }, memberName)
    .slice(0, MAX_ROWS)
    .map((member) => ({
      member,
      name: memberName(member),
      subtitle: `${member.user.username}${isTimedOut(member) ? ' · timed out' : ''} · joined ${new Date(member.joined_at).toLocaleDateString()}`,
      rights: moderationRights(guild, perms, me, meId, member),
    }));
}
