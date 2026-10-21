/** Hosts that never need the "you are leaving" confirmation. */
const BUILT_IN_TRUSTED = ['discordy.voics.nl', 'voics.nl'];

export function hostOf(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.hostname.toLowerCase().replace(/\.$/, '');
  } catch {
    return null;
  }
}

function matches(host: string, trusted: string): boolean {
  const t = trusted.toLowerCase();
  return host === t || host.endsWith(`.${t}`);
}

/** True when the link may open without confirmation: same instance, built-in hosts or hosts the user trusted. */
export function isTrustedLink(url: string, extraTrusted: readonly string[] = []): boolean {
  const host = hostOf(url);
  if (!host) return false;
  return [...BUILT_IN_TRUSTED, ...extraTrusted].some((t) => t && matches(host, t));
}
