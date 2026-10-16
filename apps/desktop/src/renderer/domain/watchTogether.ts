/** Watch Together clock math (op 24): everyone plays from their own source, kept in sync by the server clock. */
import type { WatchTogetherAction } from '@shared/contracts/gateway';

export interface PlaybackAnchor {
  action: WatchTogetherAction;
  position_ms: number;
  at_server_ms: number;
}

export interface ClockReading {
  localNowMs: number;
  /** serverNow ≈ localNow + serverOffsetMs */
  serverOffsetMs: number;
}

export function playbackPosition(anchor: PlaybackAnchor, clock: ClockReading): number {
  if (anchor.action === 'pause' || anchor.action === 'load') return anchor.position_ms;
  const serverNow = clock.localNowMs + clock.serverOffsetMs;
  return Math.max(0, anchor.position_ms + (serverNow - anchor.at_server_ms));
}

/** Drift beyond this triggers a corrective seek. */
export const DRIFT_TOLERANCE_MS = 750;

export function needsResync(localPositionMs: number, expectedPositionMs: number): boolean {
  return Math.abs(localPositionMs - expectedPositionMs) > DRIFT_TOLERANCE_MS;
}

/** Estimates the server offset from a round trip (NTP-style midpoint). */
export function estimateServerOffset(sentLocalMs: number, receivedLocalMs: number, serverMs: number): number {
  return serverMs - (sentLocalMs + receivedLocalMs) / 2;
}
