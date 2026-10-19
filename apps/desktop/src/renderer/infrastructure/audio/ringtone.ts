/**
 * Call tones synthesised with Web Audio (no audio asset): a dual tone burst, repeated every cycle
 * until stopped. Plays on the selected output device when the browser supports it.
 */
export interface TonePattern {
  tonesHz: readonly number[];
  burstS: number;
  cycleMs: number;
  gain: number;
}

/** Incoming call: the callee's ringtone. */
export const INCOMING_RING: TonePattern = { tonesHz: [440, 480], burstS: 1, cycleMs: 3_000, gain: 0.12 };

/** Outgoing call: the caller's quieter ringback while the other side is being rung. */
export const OUTGOING_RINGBACK: TonePattern = { tonesHz: [400, 450], burstS: 0.4, cycleMs: 2_000, gain: 0.05 };

export interface RingtoneDeps {
  createContext(): AudioContext;
}

export const browserRingtoneDeps: RingtoneDeps = {
  createContext: () => new AudioContext({ latencyHint: 'interactive' }),
};

export class Ringtone {
  private context: AudioContext | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly pattern: TonePattern = INCOMING_RING,
    private readonly deps: RingtoneDeps = browserRingtoneDeps,
  ) {}

  /** Starts ringing; a no-op while already ringing. `outputDeviceId` null means the system default. */
  start(outputDeviceId: string | null): void {
    if (this.context) return;
    const context = this.deps.createContext();
    this.context = context;
    if (outputDeviceId) void context.setSinkId?.(outputDeviceId).catch(() => undefined);
    ringBurst(context, this.pattern);
    this.timer = setInterval(() => ringBurst(context, this.pattern), this.pattern.cycleMs);
  }

  stop(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    const context = this.context;
    this.context = null;
    if (context) void context.close().catch(() => undefined);
  }
}

function ringBurst(context: AudioContext, { tonesHz, burstS, gain: level }: TonePattern): void {
  const at = context.currentTime;
  const gain = context.createGain();
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(level, at + 0.05);
  gain.gain.setValueAtTime(level, at + burstS - 0.1);
  gain.gain.linearRampToValueAtTime(0, at + burstS);
  gain.connect(context.destination);
  for (const frequency of tonesHz) {
    const oscillator = context.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    oscillator.connect(gain);
    oscillator.start(at);
    oscillator.stop(at + burstS);
  }
}
