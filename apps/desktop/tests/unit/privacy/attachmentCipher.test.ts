import { describe, expect, it } from 'vitest';
import { AttachmentError, decryptFile, encryptFile } from '@renderer/application/privacy/attachmentCipher';

const bytes = (text: string) => new TextEncoder().encode(text);

describe('attachment cipher', () => {
  it('round-trips and never leaves plaintext in the ciphertext', async () => {
    const plain = bytes('top secret picture bytes '.repeat(20));
    const enc = await encryptFile(plain);
    expect(enc.ciphertext.length).toBe(plain.length + 16);
    expect(Buffer.from(enc.ciphertext).includes(Buffer.from('top secret'))).toBe(false);
    const back = await decryptFile(enc.ciphertext, { ...enc, size: plain.length });
    expect(Buffer.from(back).equals(Buffer.from(plain))).toBe(true);
  });

  it('uses a fresh key and nonce per file', async () => {
    const a = await encryptFile(bytes('same'));
    const b = await encryptFile(bytes('same'));
    expect(a.key_b64).not.toBe(b.key_b64);
    expect(a.nonce_b64).not.toBe(b.nonce_b64);
    expect(atob(a.key_b64).length).toBe(32);
    expect(atob(a.nonce_b64).length).toBe(12);
    expect(atob(a.sha256_b64).length).toBe(32);
  });

  it('rejects tampered ciphertext', async () => {
    const plain = bytes('hello');
    const enc = await encryptFile(plain);
    enc.ciphertext[0] = enc.ciphertext[0]! ^ 1;
    await expect(decryptFile(enc.ciphertext, { ...enc, size: plain.length })).rejects.toMatchObject({ reason: 'integrity' });
  });

  it('rejects a hash mismatch even when the ciphertext authenticates', async () => {
    const plain = bytes('hello');
    const enc = await encryptFile(plain);
    const other = await encryptFile(bytes('different'));
    await expect(decryptFile(enc.ciphertext, { ...enc, sha256_b64: other.sha256_b64, size: plain.length })).rejects.toMatchObject({ reason: 'integrity' });
  });

  it('rejects a wrong size before decrypting', async () => {
    const enc = await encryptFile(bytes('hello'));
    await expect(decryptFile(enc.ciphertext, { ...enc, size: 99 })).rejects.toBeInstanceOf(AttachmentError);
    await expect(decryptFile(enc.ciphertext, { ...enc, size: 99 })).rejects.toMatchObject({ reason: 'size_mismatch' });
  });
});
