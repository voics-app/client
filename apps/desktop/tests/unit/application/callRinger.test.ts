import { describe, expect, it, vi } from 'vitest';
import { CallRinger, type RingerSettings } from '@renderer/application/calls/callRinger';
import type { DmCall } from '@renderer/domain/calls';

const incoming: DmCall = { channelId: '900', region: 'nl-home', ringing: ['2'], voiceStates: [{ user_id: '1', channel_id: '900' } as never] };

const settings = (extra: Partial<RingerSettings> = {}): RingerSettings => ({
  notifySounds: true,
  notifyDesktop: true,
  deafened: false,
  outputDeviceId: 'speakers',
  focused: false,
  ringtone: 'chime',
  ringtoneVolume: 0.6,
  ...extra,
});

function rig(initial: RingerSettings = settings()) {
  const ringtone = { start: vi.fn(), stop: vi.fn() };
  const ringback = { start: vi.fn(), stop: vi.fn() };
  const notify = vi.fn();
  const ringer = new CallRinger({ ringtone, ringback, settings: () => initial, notify });
  return { ringer, ringtone, ringback, notify };
}

describe('CallRinger', () => {
  it('rings on the output device when a call rings for the user', () => {
    const { ringer, ringtone, notify } = rig();
    ringer.update({ '900': incoming }, '2');
    expect(ringtone.start).toHaveBeenCalledWith('speakers', { tone: 'chime', volume: 0.6 });
    expect(notify).toHaveBeenCalledWith(incoming, '1');
  });

  it('notifies once per new call, not on every update', () => {
    const { ringer, notify } = rig();
    ringer.update({ '900': incoming }, '2');
    ringer.update({ '900': incoming }, '2');
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('stays silent when deafened or notification sounds are off', () => {
    const deafened = rig(settings({ deafened: true }));
    deafened.ringer.update({ '900': incoming }, '2');
    expect(deafened.ringtone.start).not.toHaveBeenCalled();
    expect(deafened.ringtone.stop).toHaveBeenCalled();

    const muted = rig(settings({ notifySounds: false }));
    muted.ringer.update({ '900': incoming }, '2');
    expect(muted.ringtone.start).not.toHaveBeenCalled();
  });

  it('does not notify while the window has focus', () => {
    const { ringer, notify } = rig(settings({ focused: true }));
    ringer.update({ '900': incoming }, '2');
    expect(notify).not.toHaveBeenCalled();
  });

  it('stops ringing once no call rings for the user', () => {
    const { ringer, ringtone } = rig();
    ringer.update({ '900': incoming }, '2');
    ringer.update({ '900': { ...incoming, ringing: [] } }, '2');
    expect(ringtone.stop).toHaveBeenCalled();
  });

  it('plays the ringback for the caller, not the ringtone', () => {
    const { ringer, ringtone, ringback } = rig();
    ringer.update({ '900': incoming }, '1');
    expect(ringback.start).toHaveBeenCalledWith('speakers', { volume: 0.6 });
    expect(ringtone.start).not.toHaveBeenCalled();
  });

  it('stops the ringback once the callee joins, and stays silent when deafened', () => {
    const { ringer, ringback } = rig();
    ringer.update({ '900': incoming }, '1');
    ringer.update({ '900': { ...incoming, ringing: [], voiceStates: [...incoming.voiceStates, { user_id: '2', channel_id: '900' } as never] } }, '1');
    expect(ringback.stop).toHaveBeenCalled();

    const deafened = rig(settings({ deafened: true }));
    deafened.ringer.update({ '900': incoming }, '1');
    expect(deafened.ringback.start).not.toHaveBeenCalled();
  });
});
