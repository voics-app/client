/** Invite codes and the shareable web links that open them. */

import { BRAND } from '@shared/brand';

const PROD_API_HOST = new URL(BRAND.apiUrl).hostname;
const PROD_LANDING = BRAND.landingUrl;
const INVITE_INPUT = new RegExp(`(?:invite/|${BRAND.protocolScheme}://invite/|/)?([\\w-]{2,32})/?(?:[?#].*)?$`);
const CODE = /^[A-Za-z0-9-]{2,32}$/;

/** Extracts the code from a bare code, a web invite URL, or a `<scheme>://invite/<code>` deep link. */
export function parseInviteCode(input: string): string {
  const text = input.trim();
  const m = INVITE_INPUT.exec(text);
  return m?.[1] ?? text;
}

export function isInviteCode(code: string): boolean {
  return CODE.test(code);
}

/** Public landing origin for the connection: production uses the marketing host, the local stack serves it through its ingress. */
export function landingOrigin(apiUrl: string): string {
  try {
    const url = new URL(apiUrl);
    if (url.hostname === PROD_API_HOST) return PROD_LANDING;
    return url.origin;
  } catch {
    return PROD_LANDING;
  }
}

/** Clickable invite link: opens the web invite page, which launches the desktop app. */
export function inviteWebUrl(code: string, apiUrl: string): string {
  return `${landingOrigin(apiUrl)}/invite/${encodeURIComponent(code)}`;
}
