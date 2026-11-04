import { brand } from './brandConfig';

/** Hosts that never need the "you are leaving" confirmation. */
function builtInTrusted(): string[] {
  return [new URL(brand().landingUrl).hostname, brand().baseDomain];
}

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
  return [...builtInTrusted(), ...extraTrusted].some((t) => t && matches(host, t));
}
