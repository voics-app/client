/**
 * Control messages of the private delivery modes. They travel exactly like chat messages (inside the MLS
 * ciphertext for Ephemeral, over the verified DataChannel for P2P), so the relay never sees them, and the
 * receiving device knows who sent them from the same authentication as a chat message.
 */
import { parseTtl } from '../../domain/disappearing';
import { b64ToUtf8, utf8ToB64 } from './types';

export type PrivateControl = { kind: 'delete'; messageId: string } | { kind: 'timer'; ttlMs: number | null };

/** Base64 plaintext for the MLS group. */
export function encodeControl(control: PrivateControl): string {
  return utf8ToB64(JSON.stringify(controlFrame(control)));
}

/** The JSON frame (P2P wire form and the body of the MLS plaintext). */
export function controlFrame(control: PrivateControl): Record<string, unknown> {
  return control.kind === 'delete' ? { v: 1, ctl: 'delete', target: control.messageId } : { v: 1, ctl: 'timer', ttl_ms: control.ttlMs };
}

export function parseControl(raw: unknown): PrivateControl | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const p = raw as { v?: unknown; ctl?: unknown; target?: unknown; ttl_ms?: unknown };
  if (p.v !== 1) return null;
  if (p.ctl === 'delete') return typeof p.target === 'string' && /^\d{1,20}$/.test(p.target) ? { kind: 'delete', messageId: p.target } : null;
  if (p.ctl === 'timer') {
    if (p.ttl_ms === null) return { kind: 'timer', ttlMs: null };
    const ttl = parseTtl(p.ttl_ms);
    return ttl === null ? null : { kind: 'timer', ttlMs: ttl };
  }
  return null;
}

/** The control message inside a decrypted MLS plaintext, or null when it is an ordinary chat message. */
export function decodeControl(plaintextB64: string): PrivateControl | null {
  try {
    return parseControl(JSON.parse(b64ToUtf8(plaintextB64)));
  } catch {
    return null;
  }
}
