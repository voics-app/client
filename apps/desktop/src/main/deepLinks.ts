import { BRAND } from '../shared/brand';
import { authorizationRoute } from '@discordy/core/domain/botAuthorization';
/** Brand-scheme deep links → renderer routes. Anything unrecognised is dropped. */

export const PROTOCOL = BRAND.protocolScheme;
export const LEGACY_PROTOCOL = 'discordy'; // brand-check: allow (legacy installed deep links)

const ID = /^\d{1,20}$/;
const INVITE = /^[A-Za-z0-9-]{2,32}$/;
const TEMPLATE = /^[A-Za-z0-9-]{2,64}$/;
/** Account email tokens: 24 random bytes in unpadded base64url. */
const ACCOUNT_TOKEN = /^[A-Za-z0-9_-]{16,128}$/;

export function routeFromDeepLink(link: string): string | null {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return null;
  }
  if (![`${PROTOCOL}:`, `${LEGACY_PROTOCOL}:`].includes(url.protocol) || url.username || url.password || url.port || url.hash) return null;
  const parts = [url.hostname, ...url.pathname.split('/')].filter(Boolean);
  const [kind, a, b, c] = parts;
  if (kind === 'oauth2' && a === 'authorize' && parts.length === 2) return authorizationRoute(url.searchParams);
  if ((kind === 'reset-password' || kind === 'verify-email') && parts.length === 1) {
    const token = url.searchParams.get('token');
    return token && ACCOUNT_TOKEN.test(token) ? `/${kind}/${token}` : null;
  }
  if (kind === 'friend-invite' && a && ACCOUNT_TOKEN.test(a) && parts.length === 2) return `/friend-invite/${a}`;
  if (kind === 'invite' && a && INVITE.test(a) && parts.length === 2) return `/invite/${a}`;
  if (kind === 'template' && a && TEMPLATE.test(a) && parts.length === 2) return `/template/${a}`;
  if (kind === 'channels' && a && b && (a === '@me' || ID.test(a)) && ID.test(b)) {
    if (parts.length === 3) return `/channels/${a}/${b}`;
    if (parts.length === 4 && c && ID.test(c)) return `/channels/${a}/${b}/${c}`;
  }
  return null;
}

export function findDeepLink(argv: readonly string[]): string | null {
  return argv.find((arg) => arg.startsWith(`${PROTOCOL}://`) || arg.startsWith(`${LEGACY_PROTOCOL}://`)) ?? null;
}

/**
 * Routes from deep links. Until the renderer has asked for its pending route (it has then subscribed),
 * the latest link is held so a cold start never races the renderer's listener.
 */
export class DeepLinkInbox {
  private pending: string | null;
  private rendererReady = false;

  constructor(initial: string | null = null) {
    this.pending = initial;
  }

  /** Delivers now when the renderer is listening, otherwise keeps it for `take`. */
  submit(route: string, deliver: (route: string) => void): void {
    if (this.rendererReady) deliver(route);
    else this.pending = route;
  }

  /** The renderer is listening from here on; returns the link that launched the app, if any. */
  take(): string | null {
    this.rendererReady = true;
    const route = this.pending;
    this.pending = null;
    return route;
  }
}
