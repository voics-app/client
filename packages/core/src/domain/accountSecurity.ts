/** Pure rules behind the My Account security controls. */

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;

/** The text of the downloadable backup-code file: one code per line, with a warning header. */
export function backupCodesFile(codes: readonly string[], username: string, brand: string): string {
  return [
    `${brand} backup codes for ${username}`,
    'Each code works once if you lose access to your authenticator app.',
    'Keep this file somewhere safe; anyone with a code and your password can sign in.',
    '',
    ...codes,
    '',
  ].join('\n');
}

/** An error message for an unusable new password, or null when it is fine. */
export function newPasswordProblem(next: string, confirmation: string): string | null {
  if (next.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (next.length > MAX_PASSWORD_LENGTH) return `Use at most ${MAX_PASSWORD_LENGTH} characters.`;
  if (next !== confirmation) return 'The passwords do not match.';
  return null;
}

/** Deleting an account needs the username typed back, ignoring case and surrounding space. */
export function confirmationMatches(typed: string, expected: string): boolean {
  return typed.trim().toLowerCase() === expected.trim().toLowerCase() && expected.trim() !== '';
}

/** A six-digit authenticator code or a backup code (`xxxxx-xxxxx`), as the api accepts both. */
export function looksLikeSecondFactor(input: string): boolean {
  const trimmed = input.trim();
  return /^\d{6}$/.test(trimmed) || /^[a-z0-9]{5}-?[a-z0-9]{5}$/i.test(trimmed);
}

/** Groups a base32 secret in fours for manual entry. */
export function groupSecret(secret: string): string {
  return secret.replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim();
}
