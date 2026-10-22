/** Polls OS input idle time and lock state and reports when the automatic Idle flag flips. */
import { nextAutoIdle, type ManualStatus } from '@renderer/domain/selfPresence';

export interface IdleDeps {
  idleSeconds(): Promise<number>;
  timeoutMinutes(): Promise<number>;
  manual(): ManualStatus | undefined;
  /** Current automatic idle flag (shared state, so a manual status pick that clears it is seen). */
  current(): boolean;
  /** Called only when the flag changes. */
  onChange(autoIdle: boolean): void;
}

export class IdleMonitor {
  private locked = false;
  private busy = false;

  constructor(private readonly deps: IdleDeps) {}

  setLocked(locked: boolean): void {
    this.locked = locked;
    void this.tick();
  }

  async tick(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const [idleSeconds, timeoutMinutes] = await Promise.all([this.deps.idleSeconds(), this.deps.timeoutMinutes()]);
      const next = nextAutoIdle({ idleSeconds, timeoutMinutes, locked: this.locked, manual: this.deps.manual() });
      if (next !== this.deps.current()) {
        this.deps.onChange(next);
      }
    } catch {
      // Idle detection is best effort; a failed read keeps the current state.
    } finally {
      this.busy = false;
    }
  }
}
