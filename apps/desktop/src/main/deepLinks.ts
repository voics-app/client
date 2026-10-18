/** `voics://` deep links → renderer routes. Anything unrecognised is dropped. */

export const PROTOCOL = 'voics';

const ID = /^\d{1,20}$/;
const INVITE = /^[A-Za-z0-9-]{2,32}$/;

export function routeFromDeepLink(link: string): string | null {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return null;
  }
  if (url.protocol !== `${PROTOCOL}:`) return null;
  const parts = [url.hostname, ...url.pathname.split('/')].filter(Boolean);
  const [kind, a, b] = parts;
  if (kind === 'invite' && a && INVITE.test(a) && parts.length === 2) return `/invite/${a}`;
  if (kind === 'channels' && a && b && (a === '@me' || ID.test(a)) && ID.test(b) && parts.length === 3) {
    return `/channels/${a}/${b}`;
  }
  return null;
}

export function findDeepLink(argv: readonly string[]): string | null {
  return argv.find((arg) => arg.startsWith(`${PROTOCOL}://`)) ?? null;
}
