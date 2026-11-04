import { errorMessage } from '@discordy/core/application/errorMessage';
import { authErrorDisplay } from '@discordy/core/domain/authErrors';
import { ApiError } from '@discordy/core/infrastructure/http/httpClient';

/** The API's "two-factor required" answer; it carries the ticket for the second step. */
export const MFA_REQUIRED = 60008;

export const SIGN_IN_FIELDS = ['email', 'password', 'code'] as const;

export type SignInOutcome =
  | { kind: 'mfa'; ticket: string }
  | { kind: 'error'; message: string; fields: Record<string, string> };

/** Turns a failed sign-in call into the next step: the 2FA prompt, or the message and field errors to show. */
export function interpretSignInError(error: unknown): SignInOutcome {
  if (error instanceof ApiError && error.code === MFA_REQUIRED && error.ticket) return { kind: 'mfa', ticket: error.ticket };
  if (error instanceof ApiError && error.errors) {
    const shown = authErrorDisplay(error.errors, SIGN_IN_FIELDS);
    return { kind: 'error', message: shown.general ?? errorMessage(error), fields: shown.fields };
  }
  return { kind: 'error', message: errorMessage(error), fields: {} };
}
