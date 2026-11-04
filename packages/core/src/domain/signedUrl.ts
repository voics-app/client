/** Signed CDN attachment URLs carry `ex` (expiry), `is` (issued) and `hm` (signature); `ex` and `is` are hex unix seconds. */
export function signedUrlExpiryMs(url: string): number | null {
  const query = url.split('?')[1];
  if (!query) return null;
  const ex = new URLSearchParams(query).get('ex');
  if (!ex || !/^[0-9a-f]{1,12}$/i.test(ex)) return null;
  return parseInt(ex, 16) * 1000;
}

/** True when the link has expired or will within `marginMs`. Unsigned and blob: URLs never expire. */
export function isExpiring(url: string, now: number, marginMs = 60_000): boolean {
  const expiry = signedUrlExpiryMs(url);
  return expiry !== null && expiry - now <= marginMs;
}
