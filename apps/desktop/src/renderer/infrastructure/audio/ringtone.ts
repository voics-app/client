/**
 * Call tones synthesised with Web Audio (no audio asset): a pattern of notes, repeated every cycle
 * until stopped. Plays on the selected output device when the browser supports it.
 */
import type { RingtoneId } from '@renderer/domain/ringtones';
import { sharedAudioContext, wakeContext } from './sharedContext';

export interface ToneNote {
  /** Frequencies sounded together. */
  hz: readonly number[];
  /** Start offset within the cycle, seconds. */
  at: number;
  /** Length, seconds. */
  dur: number;
}

export interface TonePattern {
  notes: readonly ToneNote[];
  cycleMs: number;
  wave: OscillatorType;
  /** Peak gain at 100% volume. */
  gain: number;
}

export const RINGTONE_PATTERNS: Record<RingtoneId, TonePattern> = {
  classic: { notes: [{ hz: [440, 480], at: 0, dur: 1 }], cycleMs: 3_000, wave: 'sine', gain: 0.4 },
  chime: {
    notes: [
      { hz: [659], at: 0, dur: 0.22 },
      { hz: [784], at: 0.22, dur: 0.22 },
      { hz: [988], at: 0.44, dur: 0.5 },
    ],
    cycleMs: 2_000,
    wave: 'triangle',
    gain: 0.45,
  },
  digital: {
    notes: [
      { hz: [1175], at: 0, dur: 0.09 },
      { hz: [1175], at: 0.14, dur: 0.09 },
      { hz: [1175], at: 0.28, dur: 0.09 },
    ],
    cycleMs: 1_500,
    wave: 'square',
    gain: 0.12,
  },
  soft: { notes: [{ hz: [523, 659], at: 0, dur: 0.7 }], cycleMs: 2_500, wave: 'sine', gain: 0.35 },
};

/** Incoming call: the callee's default ringtone. */
export const INCOMING_RING: TonePattern = RINGTONE_PATTERNS.classic;

/** Outgoing call: the caller's quieter ringback while the other side is being rung. */
export const OUTGOING_RINGBACK: TonePattern = {
  notes: [
    { hz: [400, 450], at: 0, dur: 0.4 },
    { hz: [400, 450], at: 0.6, dur: 0.4 },
  ],
  cycleMs: 3_000,
  wave: 'sine',
  gain: 0.15,
};

export interface ToneOptions {
  /** Ringtone to play instead of the instance's own pattern. */
  tone?: RingtoneId;
  /** 0..1, scales the pattern's gain. */
  volume?: number;
}

export interface RingtoneDeps {
  createContext(): AudioContext;
  /** Called when ringing stops; a shared context is left open for the next ring. */
  releaseContext?(context: AudioContext): void;
}

export const browserRingtoneDeps: RingtoneDeps = {
  createContext: sharedAudioContext,
  releaseContext: () => undefined,
};

export class Ringtone {
  private context: AudioContext | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly pattern: TonePattern = INCOMING_RING,
    private readonly deps: RingtoneDeps = browserRingtoneDeps,
  ) {}

  /** Starts ringing; a no-op while already ringing. `outputDeviceId` null means the system default. */
  start(outputDeviceId: string | null, options: ToneOptions = {}): void {
    if (this.context) return;
    const context = this.deps.createContext();
    this.context = context;
    const wake = () => wakeContext(context);
    wake();
    // A stale or unplugged device must never leave the ring silent: fall back to the system default.
    if (outputDeviceId) void context.setSinkId?.(outputDeviceId).catch(() => context.setSinkId?.('').catch(() => undefined));
    // An unknown synced tone id or a garbage volume must not throw and leave the ring half started.
    const pattern = (options.tone && RINGTONE_PATTERNS[options.tone]) || this.pattern;
    const level = pattern.gain * clampVolume(options.volume ?? 1);
    const cycle = () => {
      wake();
      try {
        playCycle(context, pattern, level);
      } catch (error) {
        console.error('ringtone cycle failed', error);
      }
    };
    cycle();
    this.timer = setInterval(cycle, pattern.cycleMs);
  }

  stop(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    const context = this.context;
    this.context = null;
    if (!context) return;
    if (this.deps.releaseContext) this.deps.releaseContext(context);
    else void context.close().catch(() => undefined);
  }
}

function clampVolume(volume: number): number {
  return Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : 0.8;
}

function playCycle(context: AudioContext, pattern: TonePattern, level: number): void {
  for (const note of pattern.notes) playNote(context, note, pattern.wave, level);
}

function playNote(context: AudioContext, { hz, at: offset, dur }: ToneNote, wave: OscillatorType, level: number): void {
  const at = context.currentTime + offset;
  const fade = Math.min(0.05, dur / 4);
  const gain = context.createGain();
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(level, at + fade);
  gain.gain.setValueAtTime(level, at + dur - fade);
  gain.gain.linearRampToValueAtTime(0, at + dur);
  gain.connect(context.destination);
  for (const frequency of hz) {
    const oscillator = context.createOscillator();
    oscillator.type = wave;
    oscillator.frequency.value = frequency;
    oscillator.connect(gain);
    oscillator.start(at);
    oscillator.stop(at + dur);
  }
}
