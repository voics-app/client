/** Downloads an (encrypted) object; credentials are never attached because the CDN serves public ciphertext. */
export async function fetchBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url, { credentials: 'omit', cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}
