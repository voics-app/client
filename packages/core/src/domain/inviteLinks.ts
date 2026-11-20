/** Invite codes and the shareable web links that open them. */

import { brand } from './brandConfig';

const CODE = /^[A-Za-z0-9-]{2,32}$/;

/** Extracts the code from a bare code, a web invite URL, or a `<scheme>://invite/<code>` deep link. */
export function parseInviteCode(input: string): string {
  const text = input.trim();
  const m = new RegExp(`(?:invite/|${brand().protocolScheme}://invite/|/)?([\\w-]{2,32})/?(?:[?#].*)?$`).exec(text);
  return m?.[1] ?? text;
}

export function isInviteCode(code: string): boolean {
  return CODE.test(code);
}

/** Public landing origin for the connection: production uses the marketing host, the local stack serves it through its ingress. */
export function landingOrigin(apiUrl: string): string {
  try {
    const url = new URL(apiUrl);
    if (url.hostname === new URL(brand().apiUrl).hostname) return brand().landingUrl;
    return url.origin;
  } catch {
    return brand().landingUrl;
  }
}

/** Clickable invite link: opens the web invite page, which launches the desktop app. */
export function inviteWebUrl(code: string, apiUrl: string): string {
  return `${landingOrigin(apiUrl)}/invite/${encodeURIComponent(code)}`;
}

/** Invite codes in `text` for links to this instance's invite page (host from the brand module or the connection). Deduplicated, in order. */
export function instanceInviteCodes(text: string, apiUrl: string): string[] {
  const hosts = new Set<string>();
  for (const origin of [landingOrigin(apiUrl), brand().landingUrl]) {
    try {
      hosts.add(new URL(origin).host.toLowerCase());
    } catch {
      // ignore a malformed origin
    }
  }
  const codes: string[] = [];
  for (const m of text.matchAll(/https?:\/\/([^\s/<>]+)\/invite\/([A-Za-z0-9-]{2,32})(?![\w-])/gi)) {
    if (hosts.has(m[1]!.toLowerCase()) && !codes.includes(m[2]!)) codes.push(m[2]!);
  }
  return codes;
}

/** The fragment keeps the bearer token out of HTTP requests and access logs. */
export function friendInviteWebUrl(token: string, apiUrl: string): string {
  return `${landingOrigin(apiUrl)}/friend-invite/#${encodeURIComponent(token)}`;
}
