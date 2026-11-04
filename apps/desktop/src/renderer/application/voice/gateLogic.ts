/** Pure microphone gating logic: VAD with hysteresis, push-to-talk release delay, and the combined gate. */
import type { InputMode } from '@discordy/core/application/stores/prefsStore';

/** Maps linear RMS (0..1) to a 0..1 meter on a -60..0 dBFS scale. */
export function levelFromRms(rms: number): number {
  if (rms <= 0) return 0;
  const db = 20 * Math.log10(rms);
  return Math.max(0, Math.min(1, (db + 60) / 60));
}

export function rmsOf(samples: ArrayLike<number>): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const v = samples[i] ?? 0;
    sum += v * v;
  }
  return Math.sqrt(sum / samples.length);
}

export interface VadOptions {
  /** 0..1 meter level above which speech starts. */
  threshold: number;
  /** Closing threshold as a fraction of the opening one. */
  hysteresis?: number;
  /** Keep the gate open this long after the level drops. */
  holdMs?: number;
}

export class VadGate {
  private open = false;
  private belowSince: number | null = null;

  constructor(private options: VadOptions) {}

  configure(options: VadOptions): void {
    this.options = options;
  }

  update(level: number, nowMs: number): boolean {
    const { threshold, hysteresis = 0.7, holdMs = 250 } = this.options;
    if (level >= threshold) {
      this.open = true;
      this.belowSince = null;
    } else if (this.open && level < threshold * hysteresis) {
      this.belowSince ??= nowMs;
      if (nowMs - this.belowSince >= holdMs) {
        this.open = false;
        this.belowSince = null;
      }
    } else if (this.open) {
      this.belowSince = null;
    }
    return this.open;
  }

  reset(): void {
    this.open = false;
    this.belowSince = null;
  }
}

export class PttGate {
  private pressed = false;
  private releasedAt: number | null = null;

  constructor(private releaseDelayMs: number) {}

  setReleaseDelay(ms: number): void {
    this.releaseDelayMs = ms;
  }

  set(pressed: boolean, nowMs: number): void {
    if (pressed) {
      this.pressed = true;
      this.releasedAt = null;
    } else if (this.pressed) {
      this.pressed = false;
      this.releasedAt = nowMs;
    }
  }

  isOpen(nowMs: number): boolean {
    if (this.pressed) return true;
    return this.releasedAt !== null && nowMs - this.releasedAt < this.releaseDelayMs;
  }

  reset(): void {
    this.pressed = false;
    this.releasedAt = null;
  }
}

export interface MicGateConfig {
  mode: InputMode;
  vadThreshold: number;
  pttReleaseDelayMs: number;
}

/** Decides whether captured audio may leave the device. Self-mute always wins. */
export class MicGate {
  private readonly vad: VadGate;
  private readonly ptt: PttGate;
  private mode: InputMode;
  private selfMute = false;

  constructor(config: MicGateConfig) {
    this.mode = config.mode;
    this.vad = new VadGate({ threshold: config.vadThreshold });
    this.ptt = new PttGate(config.pttReleaseDelayMs);
  }

  configure(config: MicGateConfig): void {
    this.mode = config.mode;
    this.vad.configure({ threshold: config.vadThreshold });
    this.ptt.setReleaseDelay(config.pttReleaseDelayMs);
  }

  setSelfMute(muted: boolean): void {
    this.selfMute = muted;
  }

  setPushToTalk(pressed: boolean, nowMs: number): void {
    this.ptt.set(pressed, nowMs);
  }

  /** Feed the latest mic level; returns true when audio should be transmitted. */
  evaluate(level: number, nowMs: number): boolean {
    const vadOpen = this.vad.update(level, nowMs);
    if (this.selfMute) return false;
    return this.mode === 'ptt' ? this.ptt.isOpen(nowMs) : vadOpen;
  }
}
