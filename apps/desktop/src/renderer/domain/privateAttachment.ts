/** Pure rules for attachments in the private delivery modes: limits, validation of untrusted peer refs, display mapping. */
import type { Attachment } from '@shared/contracts/rest';

export type PrivateMode = 'ephemeral' | 'p2p';

export const MAX_PRIVATE_FILES = 10;
/** Default MinIO bucket behind the CDN path (messages service MINIO_BUCKET_ATTACHMENTS). */
export const ATTACHMENTS_BUCKET = 'discordy-attachments';
export const EPHEMERAL_MAX_FILE_BYTES = 25 * 1024 * 1024;
export const P2P_MAX_FILE_BYTES = 64 * 1024 * 1024;
/** AES-GCM appends a 16 byte tag to the ciphertext. */
export const GCM_TAG_BYTES = 16;
export const FILE_KEY_BYTES = 32;
export const FILE_NONCE_BYTES = 12;
export const FILE_HASH_BYTES = 32;

export type PrivateFileSource = { kind: 'cdn'; object_key: string } | { kind: 'p2p' };

/** Travels inside the encrypted message envelope only; never sent to the server in the clear. */
export interface PrivateFileRef {
  id: string;
  name: string;
  mime: string;
  /** Plaintext size in bytes. */
  size: number;
  sha256_b64: string;
  key_b64: string;
  nonce_b64: string;
  source: PrivateFileSource;
}

/** Standard attachment shape plus the local-only decryption ref; `url` is empty until resolved to a blob URL. */
export type PrivateAttachment = Attachment & { private: PrivateFileRef };

const INLINE_MIME = /^(image|video|audio)\/[a-z0-9][a-z0-9.+-]*$/;
const OBJECT_KEY = /^attachments\/(\d+)\/[A-Za-z0-9._~%@+=-]+(?:\/[A-Za-z0-9._~%@+=-]+)*$/;

export const maxFileBytes = (mode: PrivateMode): number => (mode === 'p2p' ? P2P_MAX_FILE_BYTES : EPHEMERAL_MAX_FILE_BYTES);
const megabytes = (bytes: number) => `${Math.round(bytes / (1024 * 1024))} MB`;

export function sanitizeFileName(name: string): string {
  const printable =[...name].filter((ch) => ch.charCodeAt(0) > 0x1f && ch.charCodeAt(0) !== 0x7f).join('');
  const base = printable.split(/[/\\]/).pop()?.trim() ?? '';
  const clean = base === '.' || base === '..' ? '' : base;
  return clean ? clean.slice(0, 255) : 'file';
}

/** Peers choose the mime; only inline-renderable media types are honoured. */
export function safeMime(mime: unknown): string {
  if (typeof mime !== 'string') return 'application/octet-stream';
  const lower = mime.toLowerCase();
  return INLINE_MIME.test(lower) ? lower : 'application/octet-stream';
}

function b64Length(value: unknown): number | null {
  if (typeof value !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return null;
  try {
    return atob(value).length;
  } catch {
    return null;
  }
}

/** Validates a ref received from a peer. Returns null for anything malformed, oversize or pointing outside this channel. */
export function parseFileRef(raw: unknown, channelId: string, mode: PrivateMode): PrivateFileRef | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Partial<PrivateFileRef>;
  if (typeof r.id !== 'string' || r.id.length === 0 || r.id.length > 64) return null;
  if (typeof r.name !== 'string') return null;
  if (typeof r.size !== 'number' || !Number.isInteger(r.size) || r.size < 0 || r.size > maxFileBytes(mode)) return null;
  if (b64Length(r.key_b64) !== FILE_KEY_BYTES) return null;
  if (b64Length(r.nonce_b64) !== FILE_NONCE_BYTES) return null;
  if (b64Length(r.sha256_b64) !== FILE_HASH_BYTES) return null;
  const source = r.source;
  if (typeof source !== 'object' || source === null) return null;
  if (mode === 'p2p') {
    if (source.kind !== 'p2p') return null;
  } else {
    if (source.kind !== 'cdn' || typeof source.object_key !== 'string') return null;
    const match = OBJECT_KEY.exec(source.object_key);
    if (!match || match[1] !== channelId || source.object_key.split('/').includes('..')) return null;
  }
  return {
    id: r.id,
    name: sanitizeFileName(r.name),
    mime: safeMime(r.mime),
    size: r.size,
    sha256_b64: r.sha256_b64!,
    key_b64: r.key_b64!,
    nonce_b64: r.nonce_b64!,
    source: source.kind === 'cdn' ? { kind: 'cdn', object_key: source.object_key } : { kind: 'p2p' },
  };
}

/** Human-readable reason the files cannot be sent, or null when they are acceptable. */
export function checkOutgoingFiles(files: { name: string; size: number }[], mode: PrivateMode): string | null {
  if (files.length > MAX_PRIVATE_FILES) return `Attach at most ${MAX_PRIVATE_FILES} files per message.`;
  const limit = maxFileBytes(mode);
  for (const file of files) {
    if (file.size === 0) return `${file.name} is empty and cannot be sent.`;
    if (file.size > limit) return `${file.name} is larger than the ${megabytes(limit)} limit for ${mode === 'p2p' ? 'P2P' : 'Ephemeral'} chats.`;
  }
  return null;
}

export function toAttachment(ref: PrivateFileRef): PrivateAttachment {
  return { id: ref.id, filename: ref.name, content_type: ref.mime, size: ref.size, url: '', private: ref };
}

export function privateRefOf(attachment: Attachment): PrivateFileRef | null {
  const ref = (attachment as Partial<PrivateAttachment>).private;
  return ref ?? null;
}
