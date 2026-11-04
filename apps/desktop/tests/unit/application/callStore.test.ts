import { beforeEach, describe, expect, it } from 'vitest';
import { createDispatchRouter } from '@renderer/application/dispatchRouter';
import { useCallStore } from '@discordy/core/application/stores/callStore';
import type { CallEvent } from '@discordy/core/contracts/gateway';
import type { VoiceState } from '@discordy/core/contracts/rest';

const voice = (userId: string): VoiceState =>
  ({ channel_id: '900', guild_id: null, user_id: userId, session_id: `s${userId}`, self_mute: false, self_deaf: false }) as unknown as VoiceState;

const event = (ringing: string[], voiceStates = [voice('1')]): CallEvent => ({
  channel_id: '900',
  message_id: null,
  region: 'nl-home',
  ringing,
  voice_states: voiceStates,
});

const ctx = {
  onVoiceServerUpdate: () => undefined,
  onIncomingMessage: () => undefined,
  invalidate: () => undefined,
};

describe('call store from gateway dispatch', () => {
  beforeEach(() => useCallStore.setState({ calls: {} }));

  it('CALL_CREATE and CALL_UPDATE store the call, CALL_DELETE removes it', () => {
    const dispatch = createDispatchRouter(ctx);
    dispatch('CALL_CREATE', event(['2']));
    expect(useCallStore.getState().calls['900']?.ringing).toEqual(['2']);

    dispatch('CALL_UPDATE', event([], [voice('1'), voice('2')]));
    expect(useCallStore.getState().calls['900']).toMatchObject({ ringing: [], voiceStates: [voice('1'), voice('2')] });

    dispatch('CALL_DELETE', { channel_id: '900', message_id: null });
    expect(useCallStore.getState().calls).toEqual({});
  });

  it('stopRinging drops the user from ringing locally', () => {
    createDispatchRouter(ctx)('CALL_CREATE', event(['2', '3']));
    useCallStore.getState().stopRinging('900', '2');
    expect(useCallStore.getState().calls['900']?.ringing).toEqual(['3']);
  });
});
