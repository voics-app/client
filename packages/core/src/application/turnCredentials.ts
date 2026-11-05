/** Holds the gateway-issued TURN credentials and asks for new ones before they expire. */
import type { TurnCredentials as TurnPayload } from '../contracts/rest';
import { iceServersFromTurn, refreshDelayMs, type IceServer } from '../domain/turn';

export class TurnCredentials {
  private current: TurnPayload | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  /** `requestRefresh` must lead to another `update` (the gateway re-sends credentials in READY). */
  constructor(private readonly requestRefresh: () => void) {}

  update(turn: TurnPayload | null | undefined): void {
    this.cancelTimer();
    this.current = turn ?? null;
    if (this.current) this.timer = setTimeout(this.requestRefresh, refreshDelayMs(this.current.ttl));
  }

  iceServers(): IceServer[] {
    return iceServersFromTurn(this.current);
  }

  clear(): void {
    this.cancelTimer();
    this.current = null;
  }

  private cancelTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
