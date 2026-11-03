import { describe, expect, it, vi } from 'vitest';
import { shouldPlaySound, voiceTransitionSounds, type VoiceSoundSnapshot } from '@renderer/domain/sounds';
import { IDLE_SNAPSHOT, VoiceSounds } from '@renderer/application/voice/voiceSounds';
import { SoundEffects } from '@renderer/infrastructure/audio/sfx';
import { Ringtone } from '@renderer/infrastructure/audio/ringtone';

const snap = (extra: Partial<VoiceSoundSnapshot> = {}): VoiceSoundSnapshot => ({ ...IDLE_SNAPSHOT, connected: true, channelId: 'c1', ...extra });

describe('shouldPlaySound', () => {
  const base = { enabled: true, toggles: {}, doNotDisturb: false };
  it('plays by default', () => expect(shouldPlaySound('mute', base)).toBe(true));
  it('is silenced by the master toggle', () => expect(shouldPlaySound('mute', { ...base, enabled: false })).toBe(false));
  it('is silenced by its own toggle only', () => {
    const toggles = { mute: false };
    expect(shouldPlaySound('mute', { ...base, toggles })).toBe(false);
    expect(shouldPlaySound('unmute', { ...base, toggles })).toBe(true);
  });
  it('is silenced by Do Not Disturb', () => expect(shouldPlaySound('selfJoin', { ...base, doNotDisturb: true })).toBe(false));
});

describe('voiceTransitionSounds', () => {
  it('maps join, leave and self state changes to sounds', () => {
    expect(voiceTransitionSounds(IDLE_SNAPSHOT, snap())).toEqual(['selfJoin']);
    expect(voiceTransitionSounds(snap(), IDLE_SNAPSHOT)).toEqual(['selfLeave']);
    expect(voiceTransitionSounds(snap(), snap({ others: ['2'] }))).toEqual(['userJoin']);
    expect(voiceTransitionSounds(snap({ others: ['2'] }), snap())).toEqual(['userLeave']);
    expect(voiceTransitionSounds(snap(), snap({ selfMute: true }))).toEqual(['mute']);
    expect(voiceTransitionSounds(snap({ selfMute: true }), snap())).toEqual(['unmute']);
    expect(voiceTransitionSounds(snap(), snap({ selfMute: true, selfDeaf: true }))).toEqual(['deafen']);
    expect(voiceTransitionSounds(snap({ selfDeaf: true }), snap())).toEqual(['undeafen']);
  });
  it('does not announce the participants already present when joining', () => {
    expect(voiceTransitionSounds(IDLE_SNAPSHOT, snap({ others: ['2', '3'] }))).toEqual(['selfJoin']);
  });
});

describe('VoiceSounds', () => {
  it('plays only sounds the policy allows', () => {
    const play = vi.fn();
    let toggles: Record<string, boolean> = {};
    const sounds = new VoiceSounds({ play, policy: () => ({ enabled: true, toggles, doNotDisturb: false }) });
    sounds.update(snap());
    expect(play).toHaveBeenCalledWith('selfJoin');
    toggles = { mute: false };
    sounds.update(snap({ selfMute: true }));
    expect(play).toHaveBeenCalledTimes(1);
  });
});

function fakeContext(state: 'suspended' | 'running') {
  return {
    state,
    currentTime: 0,
    destination: {},
    resume: vi.fn(async () => undefined),
    setSinkId: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
    createGain: () => ({ gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn() }),
    createOscillator: () => ({ type: 'sine', frequency: { value: 0 }, start: vi.fn(), stop: vi.fn(), connect: vi.fn() }),
  };
}

describe('audio resume (ringtone regression)', () => {
  it('resumes a suspended context when the ringtone starts', () => {
    const context = fakeContext('suspended');
    const ringtone = new Ringtone(undefined, { createContext: () => context as unknown as AudioContext });
    ringtone.start(null);
    expect(context.resume).toHaveBeenCalled();
    ringtone.stop();
  });
  it('resumes and routes sound effects to the output device', () => {
    const context = fakeContext('suspended');
    new SoundEffects(() => context as unknown as AudioContext).play('selfJoin', 1, 'spk');
    expect(context.resume).toHaveBeenCalled();
    expect(context.setSinkId).toHaveBeenCalledWith('spk');
  });
});

describe('new sounds default on', () => {
  it.each(['message', 'friendRequest'] as const)('%s plays with the default (empty) toggles', (sound) => {
    expect(shouldPlaySound(sound, { enabled: true, toggles: {}, doNotDisturb: false })).toBe(true);
    expect(shouldPlaySound(sound, { enabled: true, toggles: {}, doNotDisturb: true })).toBe(false);
  });
});
