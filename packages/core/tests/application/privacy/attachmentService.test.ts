import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AttachmentService } from '../../../src/application/privacy/attachmentService';
import { AttachmentError } from '../../../src/application/privacy/attachmentCipher';
import { useTransferStore } from '../../../src/application/stores/transferStore';
import { EPHEMERAL_MAX_FILE_BYTES, privateRefOf } from '../../../src/domain/privateAttachment';

const file = (name: string, text: string, type = 'text/plain') => new File([text], name, { type });

function setup() {
  const stored = new Map<string, Uint8Array>();
  const api = {
    createAttachmentSlots: vi.fn(async (_c: string, files: { filename: string; file_size: number }[]) => ({
      attachments: files.map((_f, i) => ({ id: `s${i}`, upload_url: `https://cdn.test/put/${i}`, upload_filename: `attachments/500/u${i}/blob.bin` })),
    })),
    refreshAttachmentUrls: vi.fn(async (_c: string, urls: string[]) => ({
      refreshed_urls: urls.map((original) => ({ original, refreshed: `https://cdn.test/cdn/${original}?ex=ff&is=1&hm=00` })),
    })),
    upload: vi.fn(async (url: string, blob: Blob) => {
      stored.set(url, new Uint8Array(await blob.arrayBuffer()));
    }),
  };
  const fetchBytes = vi.fn(async (url: string) => {
    const key = [...stored.keys()][Number(url.match(/u(\d)/)![1])]!;
    return stored.get(key)!;
  });
  const service = new AttachmentService({
    api,
    fetchBytes,
    createObjectUrl: (blob) => `blob:test/${blob.size}-${Math.random().toString(16).slice(2)}`,
  });
  return { service, api, stored, fetchBytes };
}

describe('AttachmentService ephemeral upload', () => {
  beforeEach(() => useTransferStore.getState().reset());

  it('uploads only ciphertext under an opaque filename and returns refs with key material', async () => {
    const { service, api, stored } = setup();
    const result = await service.prepareCdn('500', [file('holiday.png', 'PLAINTEXT-IMAGE-BYTES', 'image/png')], 'm1');
    expect(api.createAttachmentSlots).toHaveBeenCalledWith('500', [{ filename: 'blob.bin', file_size: 'PLAINTEXT-IMAGE-BYTES'.length + 16 }]);
    const uploaded = [...stored.values()][0]!;
    expect(Buffer.from(uploaded).includes(Buffer.from('PLAINTEXT'))).toBe(false);
    const ref = privateRefOf(result[0]!)!;
    expect(ref).toMatchObject({ id: 'm1:0', name: 'holiday.png', mime: 'image/png', size: 21, source: { kind: 'cdn', object_key: 'attachments/500/u0/blob.bin' } });
    expect(ref.key_b64).toBeTruthy();
    expect(useTransferStore.getState().transfers['m1:0']?.state).toBe('done');
  });

  it('shows the original file locally without a download', async () => {
    const { service, fetchBytes } = setup();
    const [att] = await service.prepareCdn('500', [file('a.txt', 'hello')], 'm1');
    await expect(service.resolve(att!, '500')).resolves.toMatch(/^blob:/);
    expect(fetchBytes).not.toHaveBeenCalled();
  });

  it('rejects oversize files before any network call', async () => {
    const { service, api } = setup();
    const big = { name: 'big.bin', size: EPHEMERAL_MAX_FILE_BYTES + 1, type: '', arrayBuffer: vi.fn() } as unknown as File;
    await expect(service.prepareCdn('500', [big], 'm1')).rejects.toMatchObject({ reason: 'too_large' });
    expect(api.createAttachmentSlots).not.toHaveBeenCalled();
  });

  it('marks the transfer failed and throws a clear error when the upload fails', async () => {
    const { service, api } = setup();
    api.upload.mockRejectedValueOnce(new Error('503'));
    await expect(service.prepareCdn('500', [file('a.txt', 'hello')], 'm1')).rejects.toMatchObject({ reason: 'upload_failed' });
    expect(useTransferStore.getState().transfers['m1:0']).toMatchObject({ state: 'error' });
  });
});

describe('AttachmentService receiving', () => {
  beforeEach(() => useTransferStore.getState().reset());

  async function sentAttachment() {
    const ctx = setup();
    const [att] = await ctx.service.prepareCdn('500', [file('note.txt', 'secret note')], 'm1');
    const receiver = new AttachmentService({
      api: ctx.api,
      fetchBytes: ctx.fetchBytes,
      createObjectUrl: () => 'blob:receiver/1',
    });
    return { ...ctx, att: att!, receiver };
  }

  it('asks the server for a signed link, downloads it, decrypts, verifies and returns a blob url', async () => {
    const { receiver, att, fetchBytes, api } = await sentAttachment();
    await expect(receiver.resolve(att, '500')).resolves.toBe('blob:receiver/1');
    expect(api.refreshAttachmentUrls).toHaveBeenCalledWith('500', ['attachments/500/u0/blob.bin']);
    expect(fetchBytes).toHaveBeenCalledWith('https://cdn.test/cdn/attachments/500/u0/blob.bin?ex=ff&is=1&hm=00');
    expect(useTransferStore.getState().transfers['m1:0']?.state).toBe('done');
  });

  it('resolves concurrent requests with a single download', async () => {
    const { receiver, att, fetchBytes } = await sentAttachment();
    await Promise.all([receiver.resolve(att, '500'), receiver.resolve(att, '500')]);
    expect(fetchBytes).toHaveBeenCalledTimes(1);
  });

  it('fails the download clearly when the server refuses to sign the link', async () => {
    const { receiver, att, api, fetchBytes } = await sentAttachment();
    api.refreshAttachmentUrls.mockRejectedValueOnce(new Error('403'));
    await expect(receiver.resolve(att, '500')).rejects.toMatchObject({ reason: 'download_failed' });
    expect(fetchBytes).not.toHaveBeenCalled();
  });

  it('refuses tampered ciphertext with an integrity error', async () => {
    const { receiver, att, stored } = await sentAttachment();
    const bytes = [...stored.values()][0]!;
    bytes[3] = bytes[3]! ^ 0xff;
    await expect(receiver.resolve(att, '500')).rejects.toMatchObject({ reason: 'integrity' });
    expect(useTransferStore.getState().transfers['m1:0']).toMatchObject({ state: 'error' });
  });

  it('surfaces download failures and allows retry', async () => {
    const { receiver, att, fetchBytes } = await sentAttachment();
    fetchBytes.mockRejectedValueOnce(new Error('404'));
    await expect(receiver.resolve(att, '500')).rejects.toMatchObject({ reason: 'download_failed' });
    await expect(receiver.resolve(att, '500')).resolves.toMatch(/^blob:/);
  });

  it('refuses a ref pointing at another channel', async () => {
    const { receiver, att } = await sentAttachment();
    await expect(receiver.resolve(att, '999')).rejects.toBeInstanceOf(AttachmentError);
  });

  it('reports p2p attachments that were never received on this device as unavailable', async () => {
    const { receiver } = await sentAttachment();
    const p2p = { id: 'x:0', filename: 'a', size: 1, url: '', private: { id: 'x:0', name: 'a', mime: 'text/plain', size: 1, sha256_b64: '', key_b64: '', nonce_b64: '', source: { kind: 'p2p' as const } } };
    await expect(receiver.resolve(p2p, '500')).rejects.toMatchObject({ reason: 'unavailable' });
  });
});
