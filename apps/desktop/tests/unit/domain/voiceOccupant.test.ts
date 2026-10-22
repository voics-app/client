import { describe, expect, it } from 'vitest';
import { Permission } from '@shared/contracts/permissions';
import { ChannelType } from '@shared/contracts/rest';
import { canDragOccupant, canDropOccupant, channelCapacity, occupantFlags } from '@renderer/domain/voiceOccupant';

const base = { mute: false, deaf: false, self_mute: false, self_deaf: false, self_video: false, self_stream: false };

describe('occupantFlags', () => {
  it('distinguishes server from self mute and deafen', () => {
    expect(occupantFlags({ ...base, self_mute: true }).mute).toBe('self');
    expect(occupantFlags({ ...base, self_mute: true, mute: true }).mute).toBe('server');
    expect(occupantFlags({ ...base, self_deaf: true }).deaf).toBe('self');
    expect(occupantFlags({ ...base, deaf: true }).deaf).toBe('server');
    expect(occupantFlags(base)).toEqual({ mute: null, deaf: null, camera: false, live: false });
  });
  it('reports camera and stream', () => {
    expect(occupantFlags({ ...base, self_video: true, self_stream: true })).toMatchObject({ camera: true, live: true });
  });
});

describe('channelCapacity', () => {
  it('has no label without a limit', () => {
    expect(channelCapacity(undefined, 4, false)).toEqual({ label: null, full: false, joinBlocked: false });
    expect(channelCapacity(0, 4, false).label).toBeNull();
  });
  it('shows n/limit and blocks join only when full', () => {
    expect(channelCapacity(10, 3, false)).toEqual({ label: '3/10', full: false, joinBlocked: false });
    expect(channelCapacity(2, 2, false)).toEqual({ label: '2/2', full: true, joinBlocked: true });
  });
  it('lets MOVE_MEMBERS users join a full channel', () => {
    expect(channelCapacity(2, 2, true)).toMatchObject({ full: true, joinBlocked: false });
  });
});

describe('drag to move', () => {
  const state = { user_id: 'u2', channel_id: 'v1', guild_id: 'g' };
  it('needs MOVE_MEMBERS and cannot drag yourself', () => {
    expect(canDragOccupant(Permission.MOVE_MEMBERS, state, 'u1')).toBe(true);
    expect(canDragOccupant(0n, state, 'u1')).toBe(false);
    expect(canDragOccupant(Permission.MOVE_MEMBERS, state, 'u2')).toBe(false);
  });
  it('accepts other voice or stage channels in the same guild only', () => {
    expect(canDropOccupant(state, { id: 'v2', type: ChannelType.GUILD_VOICE, guild_id: 'g' })).toBe(true);
    expect(canDropOccupant(state, { id: 'v2', type: ChannelType.GUILD_STAGE_VOICE, guild_id: 'g' })).toBe(true);
    expect(canDropOccupant(state, { id: 'v1', type: ChannelType.GUILD_VOICE, guild_id: 'g' })).toBe(false);
    expect(canDropOccupant(state, { id: 't', type: ChannelType.GUILD_TEXT, guild_id: 'g' })).toBe(false);
    expect(canDropOccupant(state, { id: 'v9', type: ChannelType.GUILD_VOICE, guild_id: 'other' })).toBe(false);
  });
});
