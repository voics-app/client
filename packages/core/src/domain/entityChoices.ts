/** The people, roles and channels an application command option or a select menu may pick from. Pure; callers supply the names. */
import { ChannelType, CommandOptionType, type Channel, type Role } from '../contracts/rest';

export interface EntityChoice {
  id: string;
  label: string;
  /** Mentionable pickers list members and roles under two headings; other pickers have one list. */
  group?: 'Members' | 'Roles';
}

export interface EntityChoiceInput {
  guildId: string | null | undefined;
  /** Members of the server, or the people of a direct conversation, with the name to show. */
  users: readonly { id: string; name: string }[];
  /** Every channel the client knows; only those of `guildId` are offered. */
  channels: readonly Channel[];
  roles: readonly Role[];
  /** Restricts channel pickers to these channel types. */
  channelTypes?: readonly number[] | undefined;
}

/** Whether the option type is picked from people, roles or channels (and so needs a list rather than typed text). */
export const isEntityType = (type: number): boolean =>
  type === CommandOptionType.USER || type === CommandOptionType.ROLE || type === CommandOptionType.CHANNEL || type === CommandOptionType.MENTIONABLE;

/** Choices for one picker: users by name, roles by position (highest first, without @everyone), channels by position (categories excluded, `#name`). */
export function entityChoices(type: number, { guildId, users, channels, roles, channelTypes }: EntityChoiceInput): EntityChoice[] {
  const people = [...users].sort((a, b) => a.name.localeCompare(b.name)).map<EntityChoice>((u) => ({ id: u.id, label: u.name, group: 'Members' }));
  const pickable = [...roles].filter((r) => r.id !== guildId).sort((a, b) => b.position - a.position).map<EntityChoice>((r) => ({ id: r.id, label: r.name, group: 'Roles' }));
  if (type === CommandOptionType.USER) return people.map(({ id, label }) => ({ id, label }));
  if (type === CommandOptionType.ROLE) return pickable.map(({ id, label }) => ({ id, label }));
  if (type === CommandOptionType.MENTIONABLE) return [...people, ...pickable];
  if (type !== CommandOptionType.CHANNEL) return [];
  return channels
    .filter((c) => c.guild_id === guildId && c.type !== ChannelType.GUILD_CATEGORY && (!channelTypes?.length || channelTypes.includes(c.type)))
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map<EntityChoice>((c) => ({ id: c.id, label: `#${c.name ?? ''}` }));
}
