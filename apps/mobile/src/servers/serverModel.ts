import type { GuildMeta, GuildState } from '@discordy/core/application/stores/guildStore';
import type { ReadStates } from '../shell/railModel';
import { usersInChannel, type VoiceStoreState } from '@discordy/core/application/stores/voiceStore';
import { visibleChannelIds, type ActivityFacts } from '@discordy/core/domain/channelActivity';
import { channelIcon, isVoiceKind } from '@discordy/core/domain/channelKind';
import { isChannelMutedDeep } from '@discordy/core/domain/notificationSettings';
import { isUnread } from '@discordy/core/domain/unread';
import { Permission } from '@discordy/core/contracts/permissions';
import { ChannelType, type Channel, type GuildMember, type GuildNotificationSettings } from '@discordy/core/contracts/rest';
import { layoutOf } from '@discordy/core/domain/channelOrder';
import { computeChannelPermissions, hasPermission } from '@discordy/core/domain/permissions';

export interface ServerRow {
  id: string;
  name: string;
  icon: string | null;
}

/** The user's servers in their own order (the same order the desktop rail shows). */
export function serverRows(state: Pick<GuildState, 'order' | 'guilds'>): ServerRow[] {
  return state.order.flatMap((id) => {
    const guild = state.guilds[id];
    return guild ? [{ id, name: guild.name, icon: guild.icon }] : [];
  });
}

export interface ChannelSection {
  /** The category id; null for channels that sit outside any category. */
  id: string | null;
  title: string | null;
  channels: Channel[];
}

export interface ChannelListInput {
  guild: GuildMeta;
  channels: Record<string, Channel>;
  members: Record<string, GuildMember> | undefined;
  userId: string;
}

/** Channels of one server (every kind the desktop sidebar lists), grouped by category in the server's order, hiding what the user cannot see. */
export function channelSections({ guild, channels, members, userId }: ChannelListInput): ChannelSection[] {
  const inGuild = Object.values(channels).filter((c) => c.guild_id === guild.id);
  const ctx = { guildId: guild.id, ownerId: guild.owner_id, userId, memberRoleIds: members?.[userId]?.roles ?? [], roles: guild.roles };
  const byId = new Map(inGuild.map((c) => [c.id, c]));
  const visible = (id: string): Channel | null => {
    const channel = byId.get(id);
    if (!channel || channel.type === ChannelType.GUILD_CATEGORY) return null;
    return hasPermission(computeChannelPermissions(ctx, channel.permission_overwrites ?? []), Permission.VIEW_CHANNEL) ? channel : null;
  };
  const resolve = (ids: string[]) => ids.flatMap((id) => visible(id) ?? []);

  const layout = layoutOf(inGuild);
  const sections: ChannelSection[] = [];
  const loose = resolve(layout.loose);
  if (loose.length > 0) sections.push({ id: null, title: null, channels: loose });
  for (const group of layout.categories) {
    const children = resolve(group.children);
    if (children.length > 0) sections.push({ id: group.id, title: byId.get(group.id)?.name ?? '', channels: children });
  }
  return sections;
}

export interface CollapsedInput {
  collapsed: boolean;
  /** The open channel, which stays listed. */
  activeId: string | null;
  reads: ReadStates;
  settings: GuildNotificationSettings | undefined;
  voiceStates: VoiceStoreState['states'];
  now: number;
}

/**
 * The channels of one category the column lists. Expanded shows all of them; collapsed keeps what has something going on, as the desktop
 * sidebar does (core `visibleChannelIds`): the open channel, mentions, unread text channels and voice channels with people in them.
 */
export function channelsInSection(channels: readonly Channel[], { collapsed, activeId, reads, settings, voiceStates, now }: CollapsedInput): Channel[] {
  if (!collapsed) return [...channels];
  const facts = channels.map<ActivityFacts>((c) => {
    const voice = isVoiceKind(channelIcon(c.type));
    const read = reads[c.id];
    return {
      id: c.id,
      muted: isChannelMutedDeep(settings, c, now),
      unread: !voice && isUnread(c.last_message_id, read?.lastReadId),
      mentions: read?.mentionCount ?? 0,
      occupied: voice && usersInChannel(voiceStates, c.guild_id, c.id).length > 0,
    };
  });
  const shown = visibleChannelIds(facts, true, activeId);
  return channels.filter((c) => shown.has(c.id));
}
