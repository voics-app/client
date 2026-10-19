import { BRAND } from '../shared/brand';
/** Brand-scheme deep links → renderer routes. Anything unrecognised is dropped. */

export const PROTOCOL = BRAND.protocolScheme;

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
