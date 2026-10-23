/** Pure helpers behind the moderation tools: bulk message purge, member filters and audit filters. */
import type { GuildMember } from "@shared/contracts/rest";
import { timestampOf } from "./snowflake";

/** The API refuses to bulk-delete messages older than two weeks. */
export const BULK_DELETE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
export const BULK_DELETE_MAX_IDS = 100;

/** Ids of `authorId` messages young enough to bulk-delete. Unsent (local) messages are skipped. */
export function purgeableMessageIds(
  messages: readonly { id: string; authorId: string; local?: boolean }[],
  authorId: string,
  now: number = Date.now(),
): string[] {
  return messages
    .filter((m) => m.authorId === authorId && !m.local && now - timestampOf(m.id) < BULK_DELETE_MAX_AGE_MS)
    .map((m) => m.id);
}

/** Splits ids into bulk-delete batches of 2..100; a lone leftover id is returned as `single`. */
export function bulkDeletePlan(ids: readonly string[]): { batches: string[][]; single: string | null } {
  const batches: string[][] = [];
  for (let i = 0; i < ids.length; i += BULK_DELETE_MAX_IDS) batches.push(ids.slice(i, i + BULK_DELETE_MAX_IDS));
  const last = batches[batches.length - 1];
  if (last && last.length === 1) {
    batches.pop();
    return { batches, single: last[0] ?? null };
  }
  return { batches, single: null };
}

export type MemberSort = "name" | "joined-newest" | "joined-oldest";

export interface MemberFilter {
  query: string;
  roleId: string;
  timedOutOnly: boolean;
  sort: MemberSort;
}

export const DEFAULT_MEMBER_FILTER: MemberFilter = { query: "", roleId: "", timedOutOnly: false, sort: "name" };

export function isTimedOut(member: Pick<GuildMember, "communication_disabled_until">, now: number = Date.now()): boolean {
  const until = member.communication_disabled_until;
  return Boolean(until) && Date.parse(until as string) > now;
}

/** Filters and sorts the member management list. */
export function filterMembers(
  members: readonly GuildMember[],
  filter: MemberFilter,
  nameOf: (member: GuildMember) => string,
  now: number = Date.now(),
): GuildMember[] {
  const q = filter.query.trim().toLowerCase();
  const joined = (m: GuildMember) => Date.parse(m.joined_at) || 0;
  return members
    .filter((m) => !q || nameOf(m).toLowerCase().includes(q) || m.user.username.toLowerCase().includes(q))
    .filter((m) => !filter.roleId || m.roles.includes(filter.roleId))
    .filter((m) => !filter.timedOutOnly || isTimedOut(m, now))
    .sort((a, b) => {
      if (filter.sort === "joined-newest") return joined(b) - joined(a);
      if (filter.sort === "joined-oldest") return joined(a) - joined(b);
      return nameOf(a).localeCompare(nameOf(b));
    });
}

/** Audit log filter choices (Discord AuditLogEvent values the API records). */
export const AUDIT_FILTERS: readonly { label: string; value: number }[] = [
  { label: "Bans", value: 22 },
  { label: "Unbans", value: 23 },
  { label: "Kicks", value: 20 },
  { label: "Member updates", value: 24 },
  { label: "Role changes", value: 25 },
  { label: "Message deletions", value: 72 },
  { label: "Bulk deletions", value: 73 },
  { label: "Channel changes", value: 11 },
  { label: "Invites", value: 40 },
];

/** Bans matching a free-text search over name, id and reason. */
export function filterBans<T extends { user: { id: string; username: string; global_name?: string | null }; reason?: string | null }>(
  bans: readonly T[],
  query: string,
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...bans];
  return bans.filter((b) =>
    [b.user.username, b.user.global_name ?? "", b.user.id, b.reason ?? ""].some((v) => v.toLowerCase().includes(q)),
  );
}
