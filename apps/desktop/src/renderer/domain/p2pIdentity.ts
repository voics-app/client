/**
 * P2P identity binding: each side signs its DTLS fingerprint with its device
 * identity key, so a relaying gateway cannot man-in-the-middle the session.
 */

export function extractDtlsFingerprint(sdp: string): string | null {
  const line = sdp.split(/\r?\n/).find((l) => l.startsWith('a=fingerprint:'));
  return line ? line.slice('a=fingerprint:'.length).trim() : null;
}

export interface FingerprintBinding {
  channelId: string;
  fromDeviceId: string;
  toDeviceId: string;
  fingerprint: string;
}

export function fingerprintSigningPayload(b: FingerprintBinding): string {
  return ['discordy-p2p-v1', b.channelId, b.fromDeviceId, b.toDeviceId, b.fingerprint].join('|');
}

/** Human-comparable safety number derived from two identity keys (order-independent). */
export function safetyNumberGroups(digestHex: string): string[] {
  const digits = BigInt(`0x${digestHex}`).toString().padStart(60, '0').slice(0, 60);
  return digits.match(/.{5}/g) ?? [];
}
