import type { GatewayPort, GatewayState } from '@discordy/core/application/ports/gateway';
import { GatewayOp } from '@discordy/core/contracts/gateway';
import { currentMobilePresence, setMobileBackground } from './mobilePresence';

/** A connection that looked healthy but sat in the background this long is probably dead, so it is replaced. */
export const STALE_AFTER_MS = 30_000;

/** Whether coming back to the foreground should replace the gateway socket now. */
export function shouldResumeOnForeground(state: GatewayState, backgroundedMs: number): boolean {
  if (state === 'idle' || state === 'closed') return false;
  if (state === 'ready') return backgroundedMs >= STALE_AFTER_MS;
  return true;
}

export interface AppStateLike {
  currentState?: string | null;
  addEventListener(type: 'change', listener: (state: string) => void): { remove(): void };
}

export interface ResumableGateway extends Pick<GatewayPort, 'state' | 'send'> {
  resumeNow(): void;
  onDispatch?: GatewayPort['onDispatch'];
}

/** Resumes the gateway when the app returns to the foreground. Returns a function that stops watching. */
export function watchForeground(appState: AppStateLike, gateway: ResumableGateway, now: () => number = Date.now): () => void {
  let leftAt: number | null = null;
  let background = appState.currentState === 'background';
  setMobileBackground(background);
  const publish = () => {
    if (gateway.state === 'ready') gateway.send(GatewayOp.PRESENCE_UPDATE, currentMobilePresence());
  };
  // READY's settings must be hydrated before publishing, otherwise a stored Invisible briefly becomes Online.
  const stopGateway = gateway.onDispatch?.((event) => { if (event === 'READY' || event === 'RESUMED') publish(); });
  const subscription = appState.addEventListener('change', (next) => {
    if (next === 'background' || next === 'inactive') {
      leftAt ??= now();
      if (next === 'background' && !background) {
        background = true;
        setMobileBackground(true);
        publish();
      }
      return;
    }
    if (next !== 'active' || (leftAt === null && !background)) return;
    const away = leftAt === null ? STALE_AFTER_MS : now() - leftAt;
    leftAt = null;
    background = false;
    setMobileBackground(false);
    if (shouldResumeOnForeground(gateway.state, away)) gateway.resumeNow();
    publish();
  });
  return () => { subscription.remove(); stopGateway?.(); setMobileBackground(false); };
}
