import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GatewayOp, type E2EEEnvelope } from '@shared/contracts/gateway';
import { AttachmentService } from '@renderer/application/privacy/attachmentService';
import { DeviceDirectory } from '@renderer/application/privacy/deviceDirectory';
import { EphemeralService } from '@renderer/application/privacy/ephemeralService';
import { LocalHistory } from '@renderer/application/privacy/localHistory';
import { b64ToUtf8, utf8ToB64 } from '@renderer/application/privacy/types';
import { useMessageStore } from '@renderer/application/stores/messageStore';
import { useTransferStore } from '@renderer/application/stores/transferStore';
import { privateRefOf } from '@renderer/domain/privateAttachment';
import { BOB, FakeGateway, SELF, asApi, dm, fakeApi, fakeCrypto, resetStores } from './fakes';

const PLAINTEXT = 'PLAINTEXT-FILE-CONTENT-12345';

function setup() {
  resetStores();
  useTransferStore.getState().reset();
  const gateway = new FakeGateway();
  const { crypto, encryptFake } = fakeCrypto(gateway);
  const stored = new Map<string, Uint8Array>();
  const api = fakeApi({
    '1': [{ device_id: SELF.deviceId, identity_key_b64: SELF.identityKeyB64 }],
    '2': [{ device_id: BOB.deviceId, identity_key_b64: BOB.identityKeyB64 }],
  });
  api.createAttachmentSlots.mockImplementation(async (_c: string, files: unknown[]) => ({
    attachments: files.map((_f, i) => ({ id: `s${i}`, upload_url: `https://cdn.test/put/${i}`, upload_filename: `attachments/500/u${i}/blob.bin` })),
  }));
  api.upload.mockImplementation(async (url: string, blob: Blob) => {
    stored.set(url, new Uint8Array(await blob.arrayBuffer()));
  });
  const attachments = new AttachmentService({
    api: asApi(api) as never,
    fetchBytes: async () => [...stored.values()][0] as Uint8Array,
    createObjectUrl: () => 'blob:test/1',
  });
  const service = new EphemeralService({
    gateway,
    api: asApi(api),
    crypto,
    devices: new DeviceDirectory(asApi(api), () => 1_800_000_000_000),
    history: new LocalHistory(() => crypto),
    attachments,
    getSelf: () => SELF,
    now: () => 1_800_000_000_000,
  });
  return { service, gateway, api, stored, encryptFake, attachments };
}

describe('Ephemeral attachments: sending', () => {
  beforeEach(() => resetStores());

  it('uploads only ciphertext and puts the key material inside the MLS-encrypted envelope', async () => {
    const { service, gateway, api, stored, encryptFake } = setup();
    const file = new File([PLAINTEXT], 'plans.txt', { type: 'image/png' });
    const message = await service.send(dm(), { content: 'see attached', files: [file] });

    expect(api.createAttachmentSlots).toHaveBeenCalledWith('500', [{ filename: 'blob.bin', file_size: PLAINTEXT.length + 16 }]);
    expect(Buffer.from([...stored.values()][0]!).includes(Buffer.from('PLAINTEXT'))).toBe(false);

    const app = (gateway.ofOp(GatewayOp.E2EE_ENVELOPE) as unknown as E2EEEnvelope[]).find((f) => f.content_type === 'application')!;
    const inner = JSON.parse(b64ToUtf8(encryptFake(app.recipients[0]!.ciphertext_b64)));
    expect(inner.files).toHaveLength(1);
    expect(inner.files[0]).toMatchObject({ name: 'plans.txt', mime: 'image/png', size: PLAINTEXT.length, source: { kind: 'cdn', object_key: 'attachments/500/u0/blob.bin' } });
    expect(inner.files[0].key_b64).toBeTruthy();
    expect(inner.files[0].sha256_b64).toBeTruthy();

    const wire = JSON.stringify(gateway.sent);
    expect(wire).not.toContain(inner.files[0].key_b64);
    expect(wire).not.toContain('plans.txt');
    expect(message.attachments[0]).toMatchObject({ filename: 'plans.txt', size: PLAINTEXT.length, content_type: 'image/png' });
    expect(privateRefOf(message.attachments[0]!)).not.toBeNull();
  });

  it('sends nothing when an attachment exceeds the limit', async () => {
    const { service, gateway, api } = setup();
    const big = { name: 'big.bin', size: 26 * 1024 * 1024, type: '', arrayBuffer: vi.fn() } as unknown as File;
    await expect(service.send(dm(), { content: 'x', files: [big] })).rejects.toMatchObject({ reason: 'too_large' });
    expect(api.createAttachmentSlots).not.toHaveBeenCalled();
    expect(gateway.ofOp(GatewayOp.E2EE_ENVELOPE).filter((e) => e.content_type === 'application')).toHaveLength(0);
  });

  it('sends no message when the upload fails', async () => {
    const { service, gateway, api } = setup();
    api.upload.mockRejectedValueOnce(new Error('503'));
    await expect(service.send(dm(), { content: 'x', files: [new File(['a'], 'a.txt')] })).rejects.toMatchObject({ reason: 'upload_failed' });
    expect(gateway.ofOp(GatewayOp.E2EE_ENVELOPE).filter((e) => e.content_type === 'application')).toHaveLength(0);
    expect(useMessageStore.getState().timelines['500']).toBeUndefined();
  });
});

describe('Ephemeral attachments: receiving', () => {
  const payloadWith = (files: unknown[]) => ({ v: 1, content: 'files', nonce: '9000', timestamp: '2026-10-17T10:00:00.000Z', files });
  const envelopeFor = (encryptFake: (b: string) => string, payload: unknown): E2EEEnvelope => ({
    channel_id: '500',
    message_id: '9000',
    sender_device_id: BOB.deviceId,
    recipients: [{ user_id: '1', device_id: SELF.deviceId, ciphertext_b64: encryptFake(utf8ToB64(JSON.stringify(payload))) }],
    mls_epoch: 2,
    content_type: 'application',
  });

  it('shows validated attachments through the standard attachment shape, and decrypts on demand', async () => {
    const sender = setup();
    const sent = await sender.service.send(dm(), { content: 'hi', files: [new File([PLAINTEXT], 'a.txt', { type: 'image/png' })] });
    const ref = privateRefOf(sent.attachments[0]!)!;
    const wireRef = { ...ref, id: '9000:0' };

    const receiver = setup();
    receiver.stored.set('x', [...sender.stored.values()][0]!);
    await receiver.service.handleEnvelope(envelopeFor(receiver.encryptFake, payloadWith([wireRef])));
    const message = useMessageStore.getState().timelines['500']!.byId['9000']!;
    expect(message.attachments).toHaveLength(1);
    expect(message.attachments[0]).toMatchObject({ id: '9000:0', filename: 'a.txt', content_type: 'image/png', size: PLAINTEXT.length });
    await expect(receiver.attachments.resolve(message.attachments[0]!, '500')).resolves.toBe('blob:test/1');
    expect(receiver.gateway.ofOp(GatewayOp.E2EE_ACK)).toHaveLength(1);
  });

  it('drops refs that are malformed, point at another channel, or are not bound to this message', async () => {
    const { service, encryptFake } = setup();
    const good = { id: '9000:0', name: 'a', mime: 'image/png', size: 5, sha256_b64: btoa('x'.repeat(32)), key_b64: btoa('k'.repeat(32)), nonce_b64: btoa('n'.repeat(12)), source: { kind: 'cdn', object_key: 'attachments/500/u/blob.bin' } };
    const files = [
      good,
      { ...good, id: '9000:1', source: { kind: 'cdn', object_key: 'attachments/999/u/blob.bin' } },
      { ...good, id: '1234:0' },
      { ...good, id: '9000:2', key_b64: 'short' },
      'garbage',
    ];
    await service.handleEnvelope(envelopeFor(encryptFake, payloadWith(files)));
    const message = useMessageStore.getState().timelines['500']!.byId['9000']!;
    expect(message.attachments.map((a) => a.id)).toEqual(['9000:0']);
  });
});
