/** Pure rules for the voice screens: who is in a call, who is speaking, what the call says about itself, which voice channels to list. */
import type { GuildMeta } from '@discordy/core/application/stores/guildStore';
import type { CallState } from '@discordy/core/application/stores/voiceStore';
import { Permission } from '@discordy/core/contracts/permissions';
import { ChannelType, type Channel, type GuildMember, type User, type VoiceState } from '@discordy/core/contracts/rest';
import { channelCapacity, occupantFlags, type Capacity } from '@discordy/core/domain/voiceOccupant';
import { computeChannelPermissions, hasPermission } from '@discordy/core/domain/permissions';
import { SPEAKING_THRESHOLD } from './voiceActivity';

export interface ParticipantRow {
  userId: string;
  name: string;
  user: Pick<User, 'id' | 'avatar' | 'username' | 'global_name'>;
  self: boolean;
  muted: boolean;
  deafened: boolean;
  speaking: boolean;
}

export interface ParticipantsInput {
  /** Voice states of the channel (core's `usersInChannel`). */
  states: readonly VoiceState[];
  /** Per user level (0 to 1) from the voice store. */
  speaking: Record<string, number>;
  selfId: string;
  /** Where a name can be found when the voice state carries no member. */
  members?: Record<string, GuildMember>;
  recipients?: readonly User[];
  selfUser?: User | null;
}

function userFor(state: VoiceState, input: ParticipantsInput): User | null {
  if (state.member?.user) return state.member.user;
  const member = input.members?.[state.user_id];
  if (member) return member.user;
  const recipient = input.recipients?.find((u) => u.id === state.user_id);
  if (recipient) return recipient;
  return state.user_id === input.selfId ? (input.selfUser ?? null) : null;
}

function nameFor(state: VoiceState, user: User | null, members: ParticipantsInput['members']): string {
  const nick = state.member?.nick ?? members?.[state.user_id]?.nick;
  return nick || user?.global_name || user?.username || 'Unknown user';
}

/** People in the call, you first, then by name. Server mute and deafen win over your own, as on desktop. */
export function participantRows(input: ParticipantsInput): ParticipantRow[] {
  const rows = input.states.map((state): ParticipantRow => {
    const user = userFor(state, input);
    const flags = occupantFlags(state);
    return {
      userId: state.user_id,
      name: nameFor(state, user, input.members),
      user: user ?? { id: state.user_id, avatar: null, username: 'Unknown user', global_name: null },
      self: state.user_id === input.selfId,
      muted: flags.mute !== null,
      deafened: flags.deaf !== null,
      speaking: (input.speaking[state.user_id] ?? 0) >= SPEAKING_THRESHOLD && flags.mute === null,
    };
  });
  return rows.sort((a, b) => Number(b.self) - Number(a.self) || a.name.localeCompare(b.name));
}

/** The line under the channel name while a call exists. */
export function callHeadline(call: Pick<CallState, 'status' | 'error' | 'e2ee'>): string {
  switch (call.status) {
    case 'requesting':
      return 'Starting';
    case 'connecting':
      return 'Connecting';
    case 'reconnecting':
      return 'Reconnecting';
    case 'connected':
      return call.e2ee ? 'Voice connected, end-to-end encrypted' : 'Voice connected';
    case 'failed':
      return call.error ?? 'The call failed';
    case 'idle':
      return '';
  }
}

export interface VoiceChannelRow {
  channel: Channel;
  capacity: Capacity;
  occupants: number;
}

export interface VoiceChannelsInput {
  guild: GuildMeta;
  channels: Record<string, Channel>;
  members: Record<string, GuildMember> | undefined;
  userId: string;
  /** Voice states of this server, by user id. */
  states: Record<string, VoiceState> | undefined;
}

/** Voice channels of a server the user can see, in the server's order, with how many people are in each. */
export function voiceChannelRows({ guild, channels, members, userId, states }: VoiceChannelsInput): VoiceChannelRow[] {
  const ctx = { guildId: guild.id, ownerId: guild.owner_id, userId, memberRoleIds: members?.[userId]?.roles ?? [], roles: guild.roles };
  return Object.values(channels)
    .filter((c) => c.guild_id === guild.id && c.type === ChannelType.GUILD_VOICE)
    .filter((c) => hasPermission(computeChannelPermissions(ctx, c.permission_overwrites ?? []), Permission.VIEW_CHANNEL))
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.id.localeCompare(b.id))
    .map((channel) => {
      const occupants = Object.values(states ?? {}).filter((s) => s.channel_id === channel.id).length;
      const canMove = hasPermission(computeChannelPermissions(ctx, channel.permission_overwrites ?? []), Permission.MOVE_MEMBERS);
      return { channel, occupants, capacity: channelCapacity(channel.user_limit, occupants, canMove) };
    });
}
