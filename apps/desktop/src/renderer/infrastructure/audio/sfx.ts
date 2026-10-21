/**
 * Short UI sound effects synthesised with Web Audio (original, no audio assets, no licensing).
 * One shared AudioContext is kept, resumed on use, and routed to the selected output device.
 */
import type { SoundId } from '@renderer/domain/sounds';

interface Blip {
  hz: number;
  at: number;
  dur: number;
}

export const SOUND_PATTERNS: Record<SoundId, { blips: readonly Blip[]; wave: OscillatorType; gain: number }> = {
  selfJoin: { blips: [{ hz: 523, at: 0, dur: 0.12 }, { hz: 659, at: 0.1, dur: 0.12 }, { hz: 784, at: 0.2, dur: 0.22 }], wave: 'sine', gain: 0.3 },
  selfLeave: { blips: [{ hz: 784, at: 0, dur: 0.12 }, { hz: 659, at: 0.1, dur: 0.12 }, { hz: 440, at: 0.2, dur: 0.24 }], wave: 'sine', gain: 0.3 },
  userJoin: { blips: [{ hz: 587, at: 0, dur: 0.1 }, { hz: 784, at: 0.09, dur: 0.16 }], wave: 'triangle', gain: 0.28 },
  userLeave: { blips: [{ hz: 784, at: 0, dur: 0.1 }, { hz: 587, at: 0.09, dur: 0.16 }], wave: 'triangle', gain: 0.28 },
  mute: { blips: [{ hz: 440, at: 0, dur: 0.1 }, { hz: 330, at: 0.08, dur: 0.12 }], wave: 'sine', gain: 0.25 },
  unmute: { blips: [{ hz: 330, at: 0, dur: 0.1 }, { hz: 494, at: 0.08, dur: 0.12 }], wave: 'sine', gain: 0.25 },
  deafen: { blips: [{ hz: 392, at: 0, dur: 0.1 }, { hz: 294, at: 0.08, dur: 0.1 }, { hz: 220, at: 0.16, dur: 0.14 }], wave: 'sine', gain: 0.25 },
  undeafen: { blips: [{ hz: 220, at: 0, dur: 0.1 }, { hz: 294, at: 0.08, dur: 0.1 }, { hz: 392, at: 0.16, dur: 0.14 }], wave: 'sine', gain: 0.25 },
  message: { blips: [{ hz: 880, at: 0, dur: 0.08 }, { hz: 1175, at: 0.07, dur: 0.14 }], wave: 'sine', gain: 0.22 },
};

export class SoundEffects {
  private context: AudioContext | null = null;
  private sink: string | null = null;

  constructor(private readonly createContext: () => AudioContext = () => new AudioContext({ latencyHint: 'interactive' })) {}

  /** Plays `sound` at `volume` (0..1) on `outputDeviceId` (null: system default). */
  play(sound: SoundId, volume: number, outputDeviceId: string | null): void {
    const context = this.ensure(outputDeviceId);
    if (context.state === 'suspended') void context.resume().catch(() => undefined);
    const spec = SOUND_PATTERNS[sound];
    const level = spec.gain * Math.min(1, Math.max(0, volume));
    for (const { hz, at: offset, dur } of spec.blips) {
      const at = context.currentTime + offset;
      const gain = context.createGain();
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(level, at + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + dur + 0.06);
      gain.connect(context.destination);
      const osc = context.createOscillator();
      osc.type = spec.wave;
      osc.frequency.value = hz;
      osc.connect(gain);
      osc.start(at);
      osc.stop(at + dur + 0.08);
    }
  }

  private ensure(outputDeviceId: string | null): AudioContext {
    if (!this.context || this.context.state === 'closed') {
      this.context = this.createContext();
      this.sink = null;
    }
    if (outputDeviceId !== this.sink && outputDeviceId) {
      this.sink = outputDeviceId;
      void this.context.setSinkId?.(outputDeviceId).catch(() => undefined);
    }
    return this.context;
  }
}

export const soundEffects = new SoundEffects();
