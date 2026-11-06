/** The `reset-password` and `verify-email` links the api puts in account emails (`voics://reset-password?token=...`). */

/** Account tokens are 24 random bytes in unpadded base64url; anything else is not a token from our emails. */
const AUTH_TOKEN = /^[A-Za-z0-9_-]{16,128}$/;

export type AuthLinkKind = 'reset-password' | 'verify-email';

export interface AuthLink {
  kind: AuthLinkKind;
  token: string;
}

/** The token when it is well formed, otherwise null. */
export function parseAuthToken(raw: unknown): string | null {
  return typeof raw === 'string' && AUTH_TOKEN.test(raw) ? raw : null;
}

/** Reads the renderer route a deep link was turned into (`/reset-password/<token>`); null for any other route. */
export function parseAuthRoute(route: string): AuthLink | null {
  const match = /^\/(reset-password|verify-email)\/([^/?#]+)$/.exec(route);
  const token = match ? parseAuthToken(match[2]) : null;
  return match && token ? { kind: match[1] as AuthLinkKind, token } : null;
}
