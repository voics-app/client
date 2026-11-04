/** Per-file AES-256-GCM with a random key and nonce; the plaintext SHA-256 is verified after decryption. */
import { FILE_HASH_BYTES, FILE_KEY_BYTES, FILE_NONCE_BYTES, GCM_TAG_BYTES } from '@discordy/core/domain/privateAttachment';

export type AttachmentFailure =
  | 'too_large'
  | 'too_many'
  | 'empty'
  | 'integrity'
  | 'size_mismatch'
  | 'upload_failed'
  | 'download_failed'
  | 'transfer_failed'
  | 'unavailable'
  | 'peer_offline';

export class AttachmentError extends Error {
  constructor(
    readonly reason: AttachmentFailure,
    message: string,
  ) {
    super(message);
    this.name = 'AttachmentError';
  }
}

export interface EncryptedFile {
  ciphertext: Uint8Array;
  key_b64: string;
  nonce_b64: string;
  sha256_b64: string;
}

export interface FileKeyMaterial {
  key_b64: string;
  nonce_b64: string;
  sha256_b64: string;
  /** Plaintext size in bytes. */
  size: number;
}

export function toB64(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export function fromB64(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/** WebCrypto wants ArrayBuffer-backed views; every array here is allocated that way. */
const asSource = (bytes: Uint8Array) => bytes as unknown as BufferSource;

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', asSource(data)));
}

export async function encryptFile(plaintext: Uint8Array): Promise<EncryptedFile> {
  const keyBytes = crypto.getRandomValues(new Uint8Array(FILE_KEY_BYTES));
  const nonce = crypto.getRandomValues(new Uint8Array(FILE_NONCE_BYTES));
  const key = await crypto.subtle.importKey('raw', asSource(keyBytes), 'AES-GCM', false, ['encrypt']);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: asSource(nonce) }, key, asSource(plaintext)));
  return { ciphertext, key_b64: toB64(keyBytes), nonce_b64: toB64(nonce), sha256_b64: toB64(await sha256(plaintext)) };
}

export async function decryptFile(ciphertext: Uint8Array, material: FileKeyMaterial): Promise<Uint8Array> {
  if (ciphertext.length !== material.size + GCM_TAG_BYTES) {
    throw new AttachmentError('size_mismatch', 'The file is not the size the sender announced; it was discarded.');
  }
  let plaintext: Uint8Array;
  try {
    const key = await crypto.subtle.importKey('raw', asSource(fromB64(material.key_b64)), 'AES-GCM', false, ['decrypt']);
    plaintext = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: asSource(fromB64(material.nonce_b64)) }, key, asSource(ciphertext)));
  } catch {
    throw new AttachmentError('integrity', 'The file failed its integrity check and was discarded.');
  }
  const digest = await sha256(plaintext);
  const expected = fromB64(material.sha256_b64);
  if (expected.length !== FILE_HASH_BYTES || digest.some((b, i) => b !== expected[i])) {
    throw new AttachmentError('integrity', 'The file failed its integrity check and was discarded.');
  }
  return plaintext;
}
