import type { GatewayPort, GatewayState } from '@discordy/core/application/ports/gateway';

/** A connection that looked healthy but sat in the background this long is probably dead, so it is replaced. */
export const STALE_AFTER_MS = 30_000;

/** Whether coming back to the foreground should replace the gateway socket now. */
export function shouldResumeOnForeground(state: GatewayState, backgroundedMs: number): boolean {
  if (state === 'idle' || state === 'closed') return false;
  if (state === 'ready') return backgroundedMs >= STALE_AFTER_MS;
  return true;
}

export interface AppStateLike {
  addEventListener(type: 'change', listener: (state: string) => void): { remove(): void };
}

export interface ResumableGateway extends Pick<GatewayPort, 'state'> {
  resumeNow(): void;
}

/** Resumes the gateway when the app returns to the foreground. Returns a function that stops watching. */
export function watchForeground(appState: AppStateLike, gateway: ResumableGateway, now: () => number = Date.now): () => void {
  let leftAt: number | null = null;
  const subscription = appState.addEventListener('change', (next) => {
    if (next === 'background' || next === 'inactive') {
      leftAt ??= now();
      return;
    }
    if (next !== 'active' || leftAt === null) return;
    const away = now() - leftAt;
    leftAt = null;
    if (shouldResumeOnForeground(gateway.state, away)) gateway.resumeNow();
  });
  return () => subscription.remove();
}
