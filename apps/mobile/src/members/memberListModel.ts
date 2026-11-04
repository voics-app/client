import type { Activity, GuildMember, Role } from '@discordy/core/contracts/rest';
import type { PresenceEntry } from '@discordy/core/application/stores/peopleStores';
import { flattenSections, searchMembers, statusLine, type MemberRow } from '@discordy/core/domain/memberList';
import { buildMemberSections } from '@discordy/core/domain/memberModeration';

export type { MemberRow };

export interface MemberListInput {
  members: Record<string, GuildMember> | undefined;
  roles: readonly Role[];
  guildId: string;
  presence: Record<string, PresenceEntry>;
  collapsed: ReadonlySet<string>;
  query: string;
}

/** A person's name in this server: their nickname, else global name, else username. */
export function memberName(member: GuildMember): string {
  return member.nick || member.user.global_name || member.user.username;
}

/** Rows of the member list: groups by hoisted role, then Online and Offline, each with its members; or search results for a query. */
export function memberRows({ members, roles, guildId, presence, collapsed, query }: MemberListInput): MemberRow[] {
  const all = Object.values(members ?? {});
  const needle = query.trim();
  if (needle) {
    const found = searchMembers(all, needle, memberName);
    return [
      { kind: 'header', key: 'h:search', id: 'search', title: 'Search results', count: found.length, collapsed: false },
      ...found.map<MemberRow>((member) => ({ kind: 'member', key: `m:search:${member.user.id}`, member })),
    ];
  }
  const isOnline = (userId: string) => (presence[userId]?.status ?? 'offline') !== 'offline';
  return flattenSections(buildMemberSections(all, roles, guildId, isOnline, memberName), collapsed);
}

/** The colour of the member's highest coloured role as `#rrggbb`, or undefined for the default colour. */
export function roleColor(roles: readonly Role[], member: GuildMember): string | undefined {
  const top = roles.filter((r) => member.roles.includes(r.id) && r.color !== 0).sort((a, b) => b.position - a.position)[0];
  return top ? `#${top.color.toString(16).padStart(6, '0')}` : undefined;
}

/** The activity or custom status line under a name, or empty. */
export function activityText(activities: readonly Activity[] | undefined): string {
  return statusLine(activities)?.text ?? '';
}
