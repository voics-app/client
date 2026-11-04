import { describe, expect, it } from 'vitest';
import { callConfirmation, callTargetName, needsCallConfirmation, callRingPayload, callerOf, dmCallOf, ringableRecipients, hasParticipants, isRingingFor, isRingingOut, type DmCall } from '@renderer/domain/calls';
import type { CallEvent } from '@shared/contracts/gateway';
import type { VoiceState } from '@shared/contracts/rest';

const voice = (userId: string, channelId: string | null = '900'): VoiceState =>
  ({ channel_id: channelId, user_id: userId, session_id: `s${userId}`, self_mute: false, self_deaf: false }) as unknown as VoiceState;

const call = (extra: Partial<DmCall> = {}): DmCall => ({ channelId: '900', region: 'nl-home', ringing: ['2'], voiceStates: [voice('1')], ...extra });

describe('DM call ringing helpers', () => {
  it('maps the gateway call object', () => {
    const event: CallEvent = { channel_id: '900', message_id: null, region: 'nl-home', ringing: ['2'], voice_states: [voice('1')] };
    expect(dmCallOf(event)).toEqual({ channelId: '900', region: 'nl-home', ringing: ['2'], voiceStates: [voice('1')] });
  });

  it('rings only recipients who have not joined', () => {
    expect(isRingingFor(call(), '2')).toBe(true);
    expect(isRingingFor(call(), '1')).toBe(false);
    expect(isRingingFor(call({ voiceStates: [voice('1'), voice('2')] }), '2')).toBe(false);
    expect(isRingingFor(call({ ringing: [] }), '2')).toBe(false);
  });

  it('rings out for the caller only while alone in a call that rings someone else', () => {
    expect(isRingingOut(call(), '1')).toBe(true);
    expect(isRingingOut(call(), '2')).toBe(false);
    expect(isRingingOut(call({ ringing: [] }), '1')).toBe(false);
    expect(isRingingOut(call({ voiceStates: [voice('1'), voice('2')] }), '1')).toBe(false);
  });

  it('names the caller as the first participant who is not the user', () => {
    expect(callerOf(call(), '2')).toBe('1');
    expect(callerOf(call({ voiceStates: [] }), '2')).toBeNull();
  });

  it('a call has participants only while someone is connected', () => {
    expect(hasParticipants(undefined)).toBe(false);
    expect(hasParticipants(call({ voiceStates: [voice('1', null)] }))).toBe(false);
    expect(hasParticipants(call())).toBe(true);
  });
});

describe('ringing more people into a call', () => {
  const people = [{ id: '1' }, { id: '2' }, { id: '3' }];

  it('offers recipients who are not in the call, never the user', () => {
    expect(ringableRecipients(people, [voice('1'), voice('2')], '1')).toEqual([{ id: '3' }]);
    expect(ringableRecipients(people, [voice('2', null)], '1')).toEqual([{ id: '2' }, { id: '3' }]);
    expect(ringableRecipients(people, [], '1')).toEqual([{ id: '2' }, { id: '3' }]);
  });

  it('builds a CALL_RING body, deduplicated and capped at ten', () => {
    expect(callRingPayload('900', ['2', '3', '2'])).toEqual({ channel_id: '900', user_ids: ['2', '3'] });
    expect(callRingPayload('900', [])).toBeNull();
    const many = Array.from({ length: 14 }, (_, i) => String(i));
    expect(callRingPayload('900', many)?.user_ids).toHaveLength(10);
  });
});

describe('call confirmation', () => {
  const idle = undefined;
  const running: DmCall = { channelId: 'c1', region: 'r', ringing: [], voiceStates: [{ user_id: 'u2', channel_id: 'c1' } as VoiceState] };

  it('asks only when the setting is on and the call would start ringing', () => {
    expect(needsCallConfirmation(true, idle)).toBe(true);
    expect(needsCallConfirmation(false, idle)).toBe(false);
    expect(needsCallConfirmation(true, running)).toBe(false);
  });

  it('words the prompt for voice and video calls', () => {
    expect(callConfirmation('Ada', false)).toEqual({ title: 'Start a voice call?', body: 'Start a voice call with Ada? They will be rung.', confirmLabel: 'Start call' });
    expect(callConfirmation('Ada', true)).toMatchObject({ title: 'Start a video call?', body: 'Start a video call with Ada? They will be rung.' });
  });

  it('names the other people of a DM or the group', () => {
    const user = (id: string, username: string, global_name: string | null = null) => ({ id, username, global_name }) as never;
    expect(callTargetName({ name: null, recipients: [user('1', 'ada', 'Ada')] })).toBe('Ada');
    expect(callTargetName({ name: null, recipients: [user('1', 'ada'), user('2', 'bob')] })).toBe('ada, bob');
    expect(callTargetName({ name: 'Team', recipients: [user('1', 'ada')] })).toBe('Team');
    expect(callTargetName({ name: null, recipients: [] })).toBe('this conversation');
  });
});
