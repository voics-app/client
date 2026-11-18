/** Pure rules behind the My Account security controls. */

import { createI18n } from './i18n';

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;

/** The text of the downloadable backup-code file: one code per line, with a warning header. */
export function backupCodesFile(codes: readonly string[], username: string, brand: string, locale?: string): string {
  const { t } = createI18n(locale);
  return [
    t('account.backupHeader', { app: brand, name: username }),
    t('account.backupOnce'),
    t('account.backupSafe'),
    '',
    ...codes,
    '',
  ].join('\n');
}

/** An error message for an unusable new password, or null when it is fine. */
export function newPasswordProblem(next: string, confirmation: string, locale?: string): string | null {
  const { t } = createI18n(locale);
  if (next.length < MIN_PASSWORD_LENGTH) return t('account.passwordMinimum', { count: MIN_PASSWORD_LENGTH });
  if (next.length > MAX_PASSWORD_LENGTH) return t('account.passwordMaximum', { count: MAX_PASSWORD_LENGTH });
  if (next !== confirmation) return t('account.passwordMismatch');
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
