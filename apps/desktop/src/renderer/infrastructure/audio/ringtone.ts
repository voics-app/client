/**
 * Incoming-call ringtone synthesised with Web Audio (no audio asset): a dual tone burst, repeated
 * every cycle until stopped. Plays on the selected output device when the browser supports it.
 */
const TONES_HZ = [440, 480] as const;
const BURST_S = 1;
const CYCLE_MS = 3_000;
const TONE_GAIN = 0.12;

export interface RingtoneDeps {
  createContext(): AudioContext;
}

export const browserRingtoneDeps: RingtoneDeps = {
  createContext: () => new AudioContext({ latencyHint: 'interactive' }),
};

export class Ringtone {
  private context: AudioContext | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly deps: RingtoneDeps = browserRingtoneDeps) {}

  /** Starts ringing; a no-op while already ringing. `outputDeviceId` null means the system default. */
  start(outputDeviceId: string | null): void {
    if (this.context) return;
    const context = this.deps.createContext();
    this.context = context;
    if (outputDeviceId) void context.setSinkId?.(outputDeviceId).catch(() => undefined);
    ringBurst(context);
    this.timer = setInterval(() => ringBurst(context), CYCLE_MS);
  }

  stop(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    const context = this.context;
    this.context = null;
    if (context) void context.close().catch(() => undefined);
  }
}

function ringBurst(context: AudioContext): void {
  const at = context.currentTime;
  const gain = context.createGain();
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(TONE_GAIN, at + 0.05);
  gain.gain.setValueAtTime(TONE_GAIN, at + BURST_S - 0.1);
  gain.gain.linearRampToValueAtTime(0, at + BURST_S);
  gain.connect(context.destination);
  for (const frequency of TONES_HZ) {
    const oscillator = context.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    oscillator.connect(gain);
    oscillator.start(at);
    oscillator.stop(at + BURST_S);
  }
}
