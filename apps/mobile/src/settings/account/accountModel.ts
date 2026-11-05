import { errorMessage } from '@discordy/core/application/errorMessage';
import { confirmationMatches, newPasswordProblem } from '@discordy/core/domain/accountSecurity';
import type { AccountChange } from '@discordy/core/contracts/rest';

export type CredentialKind = 'username' | 'email' | 'password';

export interface CredentialCopy {
  title: string;
  label: string;
  button: string;
}

/** The wording desktop's change-credential dialogs use. */
export const CREDENTIAL_COPY: Record<CredentialKind, CredentialCopy> = {
  username: { title: 'Change username', label: 'New username', button: 'Save username' },
  email: { title: 'Change email', label: 'New email', button: 'Send verification' },
  password: { title: 'Change password', label: 'New password', button: 'Change password' },
};

/** The API field a failure of this kind is reported under. */
export const credentialField = (kind: CredentialKind): string => (kind === 'password' ? 'new_password' : kind);

/** The account change to send for a credential form, or the message that stops it (a new password must pass the same rules as on desktop). */
export function credentialChange(kind: CredentialKind, value: string, confirmation: string, password: string): { change: AccountChange } | { problem: string } {
  if (kind === 'password') {
    const problem = newPasswordProblem(value, confirmation);
    if (problem) return { problem };
    return { change: { new_password: value, password } };
  }
  return { change: kind === 'username' ? { username: value.trim(), password } : { email: value.trim(), password } };
}

/** Field-level message from an API error envelope, falling back to its summary. */
export function fieldMessage(error: unknown, field: string): string {
  const errors = (error as { errors?: Record<string, { _errors?: { message: string }[] }> }).errors;
  return errors?.[field]?._errors?.[0]?.message ?? errorMessage(error);
}

/** Deleting an account needs the username typed back and the password; disabling needs only the password. */
export function canLeaveAccount(mode: 'disable' | 'delete', typed: string, username: string, password: string): boolean {
  return password !== '' && (mode === 'disable' || confirmationMatches(typed, username));
}
