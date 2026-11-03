/** Member list view model: flat virtualisable rows, collapsible groups, search and activity text. */
import type { Activity, GuildMember, Role } from '@shared/contracts/rest';
import type { MemberSection } from './memberModeration';
import { CUSTOM_STATUS_ACTIVITY_TYPE } from './selfPresence';

export type MemberRow =
  | { kind: 'header'; key: string; id: string; title: string; count: number; collapsed: boolean }
  | { kind: 'member'; key: string; member: GuildMember };

/** Headers plus the members of every expanded group, in display order. */
export function flattenSections(sections: readonly MemberSection[], collapsed: ReadonlySet<string>): MemberRow[] {
  const rows: MemberRow[] = [];
  for (const section of sections) {
    const isCollapsed = collapsed.has(section.id);
    rows.push({ kind: 'header', key: `h:${section.id}`, id: section.id, title: section.title, count: section.members.length, collapsed: isCollapsed });
    if (isCollapsed) continue;
    for (const member of section.members) rows.push({ kind: 'member', key: `m:${section.id}:${member.user.id}`, member });
  }
  return rows;
}

function haystack(member: GuildMember, name: string): string[] {
  return [name, member.nick ?? '', member.user.global_name ?? '', member.user.username ?? ''].map((s) => s.toLowerCase());
}

/** Members whose display name, nickname or username contains the query; prefix matches first, then alphabetical. */
export function searchMembers(members: readonly GuildMember[], query: string, nameOf: (member: GuildMember) => string): GuildMember[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const scored: { member: GuildMember; name: string; prefix: boolean }[] = [];
  for (const member of members) {
    const name = nameOf(member);
    const fields = haystack(member, name);
    if (!fields.some((f) => f.includes(needle))) continue;
    scored.push({ member, name, prefix: fields.some((f) => f.startsWith(needle)) });
  }
  scored.sort((a, b) => Number(b.prefix) - Number(a.prefix) || a.name.localeCompare(b.name));
  return scored.map((s) => s.member);
}

const VERBS: Record<number, string> = { 0: 'Playing', 1: 'Streaming', 2: 'Listening to', 3: 'Watching', 5: 'Competing in' };

/** One line for an activity: the custom status text, or "Playing X" style for the rest. */
export function activityText(activity: Activity): string {
  if (activity.type === CUSTOM_STATUS_ACTIVITY_TYPE) return [activity.emoji?.name, activity.state].filter(Boolean).join(' ');
  const verb = VERBS[activity.type];
  return verb ? `${verb} ${activity.name}` : (activity.state ?? activity.name);
}

/** What the member list shows under a name: a real activity wins over the custom status. */
export function activityLine(activities: readonly Activity[]): string | null {
  const real = activities.find((a) => a.type !== CUSTOM_STATUS_ACTIVITY_TYPE);
  const custom = activities.find((a) => a.type === CUSTOM_STATUS_ACTIVITY_TYPE);
  const text = real ? activityText(real) : custom ? activityText(custom) : '';
  return text || null;
}

/** Above this many rows the list renders only the visible window. */
export const VIRTUALISE_ABOVE = 150;

/** The highest role the member holds that carries an icon or unicode emoji, as Discord shows beside the name. */
export function roleIconOf(roles: readonly Role[] | undefined, member: GuildMember): Role | null {
  const held = (roles ?? []).filter((r) => member.roles.includes(r.id) && (r.icon || r.unicode_emoji));
  return held.sort((a, b) => b.position - a.position)[0] ?? null;
}

/** Voice channel the user is connected to in this guild, or null. */
export function voiceChannelOf(states: Record<string, { channel_id: string | null }> | undefined, userId: string): string | null {
  return states?.[userId]?.channel_id ?? null;
}

export interface StatusLine {
  emoji: { name: string; id?: string | null } | null;
  text: string;
  /** Full text for the tooltip. */
  title: string;
}

/** Cuts text to `max` characters with an ellipsis; the full text belongs in a tooltip. */
export function truncateText(text: string, max: number): string {
  const chars = [...text];
  return chars.length <= max ? text : `${chars.slice(0, Math.max(0, max - 1)).join('').trimEnd()}…`;
}

/** Structured form of `activityLine`, so the custom status emoji can be drawn as an image. */
export function statusLine(activities: readonly Activity[] | undefined, max = 128): StatusLine | null {
  const list = activities ?? [];
  const real = list.find((a) => a.type !== CUSTOM_STATUS_ACTIVITY_TYPE);
  const custom = list.find((a) => a.type === CUSTOM_STATUS_ACTIVITY_TYPE);
  if (real) {
    const full = activityText(real);
    return full ? { emoji: null, text: truncateText(full, max), title: full } : null;
  }
  if (!custom || !(custom.state || custom.emoji?.name)) return null;
  return { emoji: custom.emoji ?? null, text: truncateText(custom.state ?? '', max), title: activityText(custom) };
}
