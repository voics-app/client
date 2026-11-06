import type { DmCall } from '@discordy/core/domain/calls';
import { ChannelType, type Channel, type User } from '@discordy/core/contracts/rest';
import { callSnapshot, type SnapshotInput } from '../../../src/voice/callkit/callKitModel';

const PAT: User = { id: 'u2', username: 'pat', global_name: 'Pat Doe', avatar: null };
const SAM: User = { id: 'u3', username: 'sam', global_name: null, avatar: null };

const channel = (id: string, over: Partial<Channel> = {}): Channel => ({ id, type: ChannelType.DM, delivery_mode: 'standard', recipients: [PAT], ...over }) as Channel;
const ring = (channelId: string, callerId = 'u2', ringing = ['u1']): DmCall => ({
  channelId,
  region: 'eu',
  ringing,
  voiceStates: [{ guild_id: null, channel_id: channelId, user_id: callerId, session_id: 's', deaf: false, mute: false, self_deaf: false, self_mute: false, self_video: false, suppress: false }],
});

const input = (over: Partial<SnapshotInput> = {}): SnapshotInput => ({
  me: 'u1',
  signedIn: true,
  gatewayReadyAt: 5,
  calls: {},
  channels: {},
  call: { status: 'idle', channelId: null },
  selfMute: false,
  titleOf: (c) => `title of ${c.id}`,
  ...over,
});

describe('callSnapshot ringing', () => {
  it('lists the calls ringing for me, with the caller named in a standard conversation', () => {
    const snap = callSnapshot(input({ calls: { '10': ring('10') }, channels: { '10': channel('10') } }));
    expect(snap.ringing).toEqual([{ channelId: '10', callerName: 'Pat Doe', isPrivate: false }]);
  });

  it('falls back to the username', () => {
    const snap = callSnapshot(input({ calls: { '10': ring('10', 'u3') }, channels: { '10': channel('10', { recipients: [SAM] }) } }));
    expect(snap.ringing[0]?.callerName).toBe('sam');
  });

  it.each(['ephemeral', 'p2p', 'e2ee', 'Standard', '', 'something-new'])('has no caller name in a %s conversation', (mode) => {
    const snap = callSnapshot(input({ calls: { '10': ring('10') }, channels: { '10': channel('10', { delivery_mode: mode as never }) } }));
    expect(snap.ringing).toEqual([{ channelId: '10', callerName: null, isPrivate: true }]);
  });

  it('has no name for a conversation it does not know yet', () => {
    expect(callSnapshot(input({ calls: { '10': ring('10') } })).ringing).toEqual([{ channelId: '10', callerName: null, isPrivate: true }]);
  });

  it('skips calls not ringing for me, including one I have joined', () => {
    const joined = { ...ring('11'), voiceStates: [...ring('11').voiceStates, { ...ring('11').voiceStates[0]!, user_id: 'u1' }] };
    const snap = callSnapshot(input({ calls: { '10': ring('10', 'u2', ['u9']), '11': joined, '12': ring('12', 'u2', []) } }));
    expect(snap.ringing).toEqual([]);
  });

  it('has nothing without a signed-in user', () => {
    expect(callSnapshot(input({ me: null, calls: { '10': ring('10') } })).ringing).toEqual([]);
  });
});

describe('callSnapshot active call', () => {
  it('is the DM call I am in, titled for a standard conversation', () => {
    const snap = callSnapshot(input({ channels: { '10': channel('10') }, call: { status: 'connecting', channelId: '10' } }));
    expect(snap.active).toEqual({ channelId: '10', title: 'title of 10', connected: false });
    expect(callSnapshot(input({ channels: { '10': channel('10') }, call: { status: 'connected', channelId: '10' } })).active?.connected).toBe(true);
  });

  it('has no title for an encrypted conversation', () => {
    const snap = callSnapshot(input({ channels: { '10': channel('10', { delivery_mode: 'ephemeral' as never }) }, call: { status: 'connected', channelId: '10' } }));
    expect(snap.active?.title).toBe('');
  });

  it('also covers a group conversation', () => {
    const group = channel('10', { type: ChannelType.GROUP_DM });
    expect(callSnapshot(input({ channels: { '10': group }, call: { status: 'connected', channelId: '10' } })).active).not.toBeNull();
  });

  it('is nothing for a server voice channel, an idle or failed call, or an unknown channel', () => {
    const voice = channel('20', { type: ChannelType.GUILD_VOICE, guild_id: 'g1' });
    expect(callSnapshot(input({ channels: { '20': voice }, call: { status: 'connected', channelId: '20' } })).active).toBeNull();
    expect(callSnapshot(input({ channels: { '10': channel('10') }, call: { status: 'idle', channelId: '10' } })).active).toBeNull();
    expect(callSnapshot(input({ channels: { '10': channel('10') }, call: { status: 'failed', channelId: '10' } })).active).toBeNull();
    expect(callSnapshot(input({ call: { status: 'connected', channelId: '10' } })).active).toBeNull();
  });

  it('carries the signed-in state, the gateway time and my mute', () => {
    const snap = callSnapshot(input({ signedIn: false, gatewayReadyAt: null, selfMute: true }));
    expect(snap).toMatchObject({ signedIn: false, gatewayReadyAt: null, selfMute: true });
  });
});
