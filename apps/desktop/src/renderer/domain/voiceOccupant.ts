/** Pure rules for voice channel rows in the sidebar: occupant flags, capacity and drag-to-move. */
import { Permission } from '@shared/contracts/permissions';
import { ChannelType, type Channel, type VoiceState } from '@shared/contracts/rest';
import { hasPermission } from './permissions';

export type MuteSource = 'server' | 'self' | null;

export interface OccupantFlags {
  mute: MuteSource;
  deaf: MuteSource;
  camera: boolean;
  live: boolean;
}

/** Server mute wins over self mute because the user cannot undo it. */
export function occupantFlags(state: Pick<VoiceState, 'mute' | 'deaf' | 'self_mute' | 'self_deaf' | 'self_video' | 'self_stream'>): OccupantFlags {
  return {
    mute: state.mute ? 'server' : state.self_mute ? 'self' : null,
    deaf: state.deaf ? 'server' : state.self_deaf ? 'self' : null,
    camera: Boolean(state.self_video),
    live: Boolean(state.self_stream),
  };
}

export const MUTE_LABEL: Record<Exclude<MuteSource, null>, string> = { server: 'Server muted', self: 'Muted' };
export const DEAF_LABEL: Record<Exclude<MuteSource, null>, string> = { server: 'Server deafened', self: 'Deafened' };

export interface Capacity {
  /** `n/limit` when a limit is set, otherwise null. */
  label: string | null;
  full: boolean;
  /** Joining is disabled: full and the user cannot move members. */
  joinBlocked: boolean;
}

export function channelCapacity(userLimit: number | undefined, occupants: number, canMoveMembers: boolean): Capacity {
  if (!userLimit || userLimit <= 0) return { label: null, full: false, joinBlocked: false };
  const full = occupants >= userLimit;
  return { label: `${occupants}/${userLimit}`, full, joinBlocked: full && !canMoveMembers };
}

const isVoiceType = (channel: Pick<Channel, 'type'>) => channel.type === ChannelType.GUILD_VOICE || channel.type === ChannelType.GUILD_STAGE_VOICE;

/** Whether the current user may start dragging this occupant (not themselves, needs MOVE_MEMBERS). */
export function canDragOccupant(permissions: bigint, state: Pick<VoiceState, 'user_id'>, me: string | undefined): boolean {
  return state.user_id !== me && hasPermission(permissions, Permission.MOVE_MEMBERS);
}

/** Whether dropping the occupant on the channel is a valid move. */
export function canDropOccupant(source: Pick<VoiceState, 'channel_id' | 'guild_id'>, target: Pick<Channel, 'id' | 'type' | 'guild_id'>): boolean {
  if (!isVoiceType(target)) return false;
  if (source.channel_id === target.id) return false;
  if (source.guild_id && target.guild_id && source.guild_id !== target.guild_id) return false;
  return true;
}
