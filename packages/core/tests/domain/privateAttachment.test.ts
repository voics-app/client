import { describe, expect, it } from 'vitest';
import {
  EPHEMERAL_MAX_FILE_BYTES,
  MAX_PRIVATE_FILES,
  P2P_MAX_FILE_BYTES,
  checkOutgoingFiles,
  parseFileRef,
  safeMime,
  sanitizeFileName,
  toAttachment,
  type PrivateFileRef,
} from '@discordy/core/domain/privateAttachment';

const b64 = (n: number) => btoa(String.fromCharCode(...new Uint8Array(n).fill(7)));
const ref = (over: Partial<PrivateFileRef> = {}): PrivateFileRef => ({
  id: '9001:0',
  name: 'cat.png',
  mime: 'image/png',
  size: 1234,
  sha256_b64: b64(32),
  key_b64: b64(32),
  nonce_b64: b64(12),
  source: { kind: 'cdn', object_key: 'attachments/500/abc/blob.bin' },
  ...over,
});

describe('sanitizeFileName', () => {
  it('drops path components and control characters', () => {
    expect(sanitizeFileName(String.raw`..\..\evil/../a` + '\u0000b.txt')).toBe('ab.txt');
  });
  it('handles windows separators', () => {
    expect(sanitizeFileName(['C:','Users','bob','secret.txt'].join(String.fromCharCode(92)))).toBe('secret.txt');
  });
  it('falls back for empty names and truncates long ones', () => {
    expect(sanitizeFileName('   ')).toBe('file');
    expect(sanitizeFileName('x'.repeat(400)).length).toBe(255);
  });
});

describe('safeMime', () => {
  it('keeps inline-renderable media types and demotes everything else', () => {
    expect(safeMime('image/png')).toBe('image/png');
    expect(safeMime('VIDEO/mp4')).toBe('video/mp4');
    expect(safeMime('text/html')).toBe('application/octet-stream');
    expect(safeMime('image/png; x=<script>')).toBe('application/octet-stream');
    expect(safeMime(undefined)).toBe('application/octet-stream');
  });
});

describe('parseFileRef', () => {
  it('accepts a well-formed ref', () => {
    expect(parseFileRef(ref(), '500', 'ephemeral')).toMatchObject({ id: '9001:0', name: 'cat.png', size: 1234 });
  });
  it.each([
    ['short key', { key_b64: b64(16) }],
    ['short nonce', { nonce_b64: b64(8) }],
    ['short hash', { sha256_b64: b64(31) }],
    ['negative size', { size: -1 }],
    ['fractional size', { size: 1.5 }],
    ['oversized', { size: EPHEMERAL_MAX_FILE_BYTES + 1 }],
    ['traversal key', { source: { kind: 'cdn', object_key: 'attachments/500/../../x' } }],
    ['foreign channel key', { source: { kind: 'cdn', object_key: 'attachments/999/abc/blob.bin' } }],
    ['url instead of key', { source: { kind: 'cdn', object_key: 'https://evil.test/x' } }],
    ['p2p source in ephemeral', { source: { kind: 'p2p' } }],
  ])('rejects %s', (_label, over) => {
    expect(parseFileRef(ref(over as Partial<PrivateFileRef>), '500', 'ephemeral')).toBeNull();
  });
  it('accepts p2p refs with the larger limit and rejects cdn refs in p2p', () => {
    expect(parseFileRef(ref({ size: P2P_MAX_FILE_BYTES, source: { kind: 'p2p' } }), '500', 'p2p')).not.toBeNull();
    expect(parseFileRef(ref({ size: P2P_MAX_FILE_BYTES + 1, source: { kind: 'p2p' } }), '500', 'p2p')).toBeNull();
    expect(parseFileRef(ref(), '500', 'p2p')).toBeNull();
  });
  it('sanitizes name and mime from the peer', () => {
    const parsed = parseFileRef(ref({ name: '../x.png', mime: 'text/html' }), '500', 'ephemeral');
    expect(parsed).toMatchObject({ name: 'x.png', mime: 'application/octet-stream' });
  });
  it('preserves bounded voice metadata within encrypted file references', () => {
    const voice = { duration_secs: 2.5, waveform: b64(64) };
    for (const mode of ['ephemeral', 'p2p'] as const) {
      const source = mode === 'p2p' ? { kind: 'p2p' as const } : ref().source;
      const parsed = parseFileRef(ref({ source, voice, mime: 'audio/ogg' }), '500', mode);
      expect(parsed?.voice).toEqual(voice);
      expect(toAttachment(parsed!)).toMatchObject(voice);
      expect(parseFileRef(ref({ source, voice: { ...voice, duration_secs: 601 } }), '500', mode)).toBeNull();
    }
  });
  it('rejects non-objects', () => {
    expect(parseFileRef(null, '500', 'ephemeral')).toBeNull();
    expect(parseFileRef('x', '500', 'ephemeral')).toBeNull();
  });
});

describe('checkOutgoingFiles', () => {
  const file = (size: number, name = 'a.bin') => ({ name, size });
  it('passes files within the limits', () => {
    expect(checkOutgoingFiles([file(10)], 'ephemeral')).toBeNull();
  });
  it('reports too many files, empty files and oversize files with the offending name', () => {
    expect(checkOutgoingFiles(Array.from({ length: MAX_PRIVATE_FILES + 1 }, () => file(1)), 'ephemeral')).toMatch(/at most/);
    expect(checkOutgoingFiles([file(0, 'empty.txt')], 'ephemeral')).toMatch(/empty\.txt.*empty/);
    expect(checkOutgoingFiles([file(EPHEMERAL_MAX_FILE_BYTES + 1, 'big.zip')], 'ephemeral')).toMatch(/big\.zip.*25 MB/);
    expect(checkOutgoingFiles([file(EPHEMERAL_MAX_FILE_BYTES + 1)], 'p2p')).toBeNull();
    expect(checkOutgoingFiles([file(P2P_MAX_FILE_BYTES + 1, 'huge.iso')], 'p2p')).toMatch(/huge\.iso.*64 MB/);
  });
});

describe('toAttachment', () => {
  it('maps a ref to the standard attachment shape with an empty url', () => {
    const a = toAttachment(ref());
    expect(a).toMatchObject({ id: '9001:0', filename: 'cat.png', content_type: 'image/png', size: 1234, url: '' });
    expect(a.private.key_b64).toBeTruthy();
  });
});
