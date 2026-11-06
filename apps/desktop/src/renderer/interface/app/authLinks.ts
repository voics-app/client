/** `reset-password` and `verify-email` deep links from account emails. */
import { useAuthLinkStore } from '@discordy/core/application/stores/authLinkStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import { parseAuthRoute, type AuthLink } from '@discordy/core/domain/authLinks';
import { attempt } from './actions';
import { getRuntime } from './runtime';

/** Signed in: an email link can only verify the address; a reset needs the signed-out screen. */
async function applySignedIn(link: AuthLink): Promise<void> {
  const ui = useUiStore.getState();
  if (link.kind === 'reset-password') {
    ui.toast({ tone: 'info', title: 'Sign out to choose a new password with this link' });
    return;
  }
  const done = await attempt(() => getRuntime().api.verifyEmail(link.token).then(() => true), 'Could not verify your email');
  if (done) ui.toast({ tone: 'success', title: 'Email verified' });
}

/**
 * Routes `/reset-password/<token>` and `/verify-email/<token>`; returns false for any other route.
 * Signed out, the link waits for the sign-in screen, which opens on the right form with the token filled in.
 * Unlike other deep links it does not wait for a sign-in. The token is never logged.
 */
export function handleAuthRoute(route: string): boolean {
  const link = parseAuthRoute(route);
  if (!link) return false;
  if (useSessionStore.getState().status === 'ready') void applySignedIn(link);
  else useAuthLinkStore.getState().set(link);
  return true;
}

/** The session became ready while a link was waiting: the person was signed in all along, so apply it as such. */
export function flushAuthLink(): void {
  const link = useAuthLinkStore.getState().take();
  if (link) void applySignedIn(link);
}
