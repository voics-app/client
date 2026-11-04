/** Turns an API `errors` envelope into per-field messages for the auth form plus one message for the banner. */
/**
 * The only message a failed sign-in ever shows. Deliberately vague: it never says whether the account exists or
 * which field was wrong (no account enumeration), whatever the server put in its error.
 */
export const SIGN_IN_FAILED = 'Wrong credentials. Please try again.';

/** Error keys the API uses for a failed credential check (wrong email, wrong password, unknown account). */
const CREDENTIAL_KEYS = ['login', 'email_or_password', 'credentials'];

export interface AuthErrorDisplay {
  fields: Record<string, string>;
  /** Shown above the form: the first error whose key is not a visible field (e.g. `login` for a wrong password). */
  general: string | null;
}

export function authErrorDisplay(errors: Record<string, unknown> | undefined, visibleFields: readonly string[]): AuthErrorDisplay {
  const fields: Record<string, string> = {};
  let general: string | null = null;
  for (const [key, value] of Object.entries(errors ?? {})) {
    const message = (value as { _errors?: { message?: string }[] } | null)?._errors?.[0]?.message;
    if (!message) continue;
    if (CREDENTIAL_KEYS.includes(key)) general = SIGN_IN_FAILED;
    else if (visibleFields.includes(key)) fields[key] = message;
    else general ??= message;
  }
  return { fields, general };
}
