import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { P2PSignal } from '@shared/contracts/gateway';
import { AttachmentService } from '@renderer/application/privacy/attachmentService';
import { encryptFile } from '@renderer/application/privacy/attachmentCipher';
import { DeviceDirectory } from '@renderer/application/privacy/deviceDirectory';
import { LocalHistory } from '@renderer/application/privacy/localHistory';
import { P2PService } from '@renderer/application/privacy/p2pService';
import { fingerprintSigningPayload } from '@renderer/domain/p2pIdentity';
import { utf8ToB64 } from '@renderer/application/privacy/types';
import { useMessageStore } from '@renderer/application/stores/messageStore';
import { useTransferStore } from '@renderer/application/stores/transferStore';
import { BOB, FakeGateway, FakePeerConnection, SDP, SELF, asApi, dm, fakeApi, fakeCrypto, resetStores, tick } from './fakes';

const CHUNK = 16 * 1024;

function setup() {
  resetStores(dm('p2p'));
  useTransferStore.getState().reset();
  const gateway = new FakeGateway();
  const { crypto } = fakeCrypto(gateway);
  const api = fakeApi({ '2': [{ device_id: BOB.deviceId, identity_key_b64: BOB.identityKeyB64 }] });
  const connections: FakePeerConnection[] = [];
  const attachments = new AttachmentService({
    api: asApi(api) as never,
    fetchBytes: async () => new Uint8Array(0),
    createObjectUrl: () => 'blob:p2p/1',
  });
  const service = new P2PService({
    gateway,
    crypto,
    devices: new DeviceDirectory(asApi(api), () => 1_800_000_000_000),
    history: new LocalHistory(() => crypto),
    attachments,
    getSelf: () => SELF,
    createPeerConnection: () => {
      const pc = new FakePeerConnection();
      connections.push(pc);
      return pc;
    },
    now: () => 1_800_000_000_000,
    connectTimeoutMs: 30_000,
  });
  return { service, connections, attachments, gateway };
}

const binding = (from: string, to: string) =>
  utf8ToB64(fingerprintSigningPayload({ channelId: '500', fromDeviceId: from, toDeviceId: to, fingerprint: 'sha-256 AA:BB' }));
const bobSignal = (over: Partial<P2PSignal>): P2PSignal => ({
  channel_id: '500',
  to_user_id: '1',
  to_device_id: SELF.deviceId,
  from_user_id: '2',
  from_device_id: BOB.deviceId,
  kind: 'answer',
  payload: JSON.stringify({ type: 'answer', sdp: SDP() }),
  identity_sig_b64: `sig:${binding(BOB.deviceId, SELF.deviceId)}`,
  ...over,
});

async function openOutgoing(ctx: ReturnType<typeof setup>, files: File[], opts: { hold?: boolean } = {}) {
  const pending = ctx.service.send(dm('p2p'), { content: 'file for you', files });
  for (let i = 0; i < 50 && ctx.gateway.sent.length === 0; i++) await tick();
  await ctx.service.handleSignal(bobSignal({}));
  const channel = ctx.connections[0]!.channel;
  channel.holdBuffer = opts.hold ?? false;
  channel.open();
  const message = await pending;
  return { message, channel };
}

const join = (chunks: Uint8Array[]) => {
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
};

describe('P2P attachments: sending', () => {
  beforeEach(() => resetStores(dm('p2p')));

  it('announces the file in the message frame and streams only encrypted chunks', async () => {
    const ctx = setup();
    const plain = 'PLAINTEXT-P2P-PAYLOAD-'.repeat(2000);
    const { message, channel } = await openOutgoing(ctx, [new File([plain], 'doc.txt', { type: 'text/plain' })]);
    await ctx.service.idle();

    const msg = JSON.parse(channel.sent[0]!);
    expect(msg).toMatchObject({ t: 'msg', content: 'file for you' });
    expect(msg.files[0]).toMatchObject({ name: 'doc.txt', size: plain.length, source: { kind: 'p2p' } });
    const header = JSON.parse(channel.sent[1]!);
    expect(header).toMatchObject({ t: 'file', id: msg.files[0].id, size: plain.length + 16 });
    expect(JSON.parse(channel.sent[2]!)).toEqual({ t: 'file-end', id: msg.files[0].id });
    expect(channel.binary.every((c) => c.length <= CHUNK)).toBe(true);
    const all = join(channel.binary);
    expect(all.length).toBe(plain.length + 16);
    expect(Buffer.from(all).includes(Buffer.from('PLAINTEXT'))).toBe(false);
    expect(message.attachments[0]).toMatchObject({ filename: 'doc.txt' });
    expect(useTransferStore.getState().transfers[msg.files[0].id]).toMatchObject({ state: 'done' });
  });

  it('applies backpressure: pauses while the channel buffer is full and resumes when it drains', async () => {
    const ctx = setup();
    const bytes = new Uint8Array(3 * 1024 * 1024).fill(1);
    const { channel } = await openOutgoing(ctx, [new File([bytes], 'big.bin')], { hold: true });
    await tick();
    const sentSoFar = channel.binary.length;
    expect(sentSoFar).toBeGreaterThan(0);
    expect(sentSoFar * CHUNK).toBeLessThanOrEqual(1024 * 1024 + CHUNK);
    expect(channel.sent.some((s) => s.includes('file-end'))).toBe(false);

    for (let i = 0; i < 20 && !channel.sent.some((s) => s.includes('file-end')); i++) {
      channel.flush();
      await tick();
    }
    expect(channel.sent.some((s) => s.includes('file-end'))).toBe(true);
    expect(join(channel.binary).length).toBe(bytes.length + 16);
    await ctx.service.idle();
  });

  it('reports progress while streaming', async () => {
    const ctx = setup();
    const { channel } = await openOutgoing(ctx, [new File([new Uint8Array(2 * 1024 * 1024)], 'p.bin')], { hold: true });
    await tick();
    const id = JSON.parse(channel.sent[0]!).files[0].id as string;
    const t = useTransferStore.getState().transfers[id]!;
    expect(t.state).toBe('sending');
    expect(t.loaded).toBeGreaterThan(0);
    expect(t.loaded).toBeLessThan(t.total);
    for (let i = 0; i < 20 && useTransferStore.getState().transfers[id]!.state !== 'done'; i++) {
      channel.flush();
      await tick();
    }
    await ctx.service.idle();
  });

  it('marks the transfer failed when the link drops mid-stream, without throwing from send', async () => {
    const ctx = setup();
    const { channel } = await openOutgoing(ctx, [new File([new Uint8Array(3 * 1024 * 1024)], 'drop.bin')], { hold: true });
    await tick();
    const id = JSON.parse(channel.sent[0]!).files[0].id as string;
    channel.close();
    channel.onclose?.();
    await ctx.service.idle();
    expect(useTransferStore.getState().transfers[id]).toMatchObject({ state: 'error', reason: 'peer_offline' });
  });

  it('rejects oversize files before connecting', async () => {
    const ctx = setup();
    const big = { name: 'huge.iso', size: 65 * 1024 * 1024, type: '', arrayBuffer: async () => new ArrayBuffer(0) } as unknown as File;
    await expect(ctx.service.send(dm('p2p'), { content: 'x', files: [big] })).rejects.toMatchObject({ reason: 'too_large' });
    expect(ctx.connections).toHaveLength(0);
  });
});

describe('P2P attachments: receiving', () => {
  async function connected() {
    const ctx = setup();
    await ctx.service.handleSignal(bobSignal({ kind: 'offer', payload: JSON.stringify({ type: 'offer', sdp: SDP() }) }));
    const channel = ctx.connections[0]!.channel;
    ctx.connections[0]!.ondatachannel?.({ channel });
    channel.open();
    return { ...ctx, channel };
  }

  async function incomingFile(plain: string, messageId = '7001') {
    const enc = await encryptFile(new TextEncoder().encode(plain));
    const ref = {
      id: `${messageId}:0`,
      name: 'recv.txt',
      mime: 'text/plain',
      size: plain.length,
      sha256_b64: enc.sha256_b64,
      key_b64: enc.key_b64,
      nonce_b64: enc.nonce_b64,
      source: { kind: 'p2p' as const },
    };
    return { ref, enc };
  }

  const deliver = async (channel: { onmessage: ((e: { data: unknown }) => void) | null }, data: unknown) => {
    channel.onmessage?.({ data });
    await tick();
  };

  const stream = async (channel: { onmessage: ((e: { data: unknown }) => void) | null }, ref: { id: string }, cipher: Uint8Array) => {
    await deliver(channel, JSON.stringify({ t: 'file', id: ref.id, size: cipher.length }));
    for (let o = 0; o < cipher.length; o += CHUNK) await deliver(channel, cipher.slice(o, o + CHUNK).buffer);
    await deliver(channel, JSON.stringify({ t: 'file-end', id: ref.id }));
  };

  beforeEach(() => useTransferStore.getState().reset());

  it('shows the message at once, tracks progress, then decrypts, verifies and exposes the file', async () => {
    const { channel, attachments } = await connected();
    const { ref, enc } = await incomingFile('hello from bob '.repeat(5000));
    await deliver(channel, JSON.stringify({ t: 'msg', id: '7001', content: 'file', timestamp: '2026-10-17T10:00:00.000Z', files: [ref] }));
    const message = useMessageStore.getState().timelines['500']!.byId['7001']!;
    expect(message.attachments).toMatchObject([{ id: '7001:0', filename: 'recv.txt', size: ref.size }]);
    expect(useTransferStore.getState().transfers['7001:0']).toMatchObject({ state: 'receiving', loaded: 0 });
    expect(attachments.urlFor('7001:0')).toBeNull();

    await deliver(channel, JSON.stringify({ t: 'file', id: '7001:0', size: enc.ciphertext.length }));
    await deliver(channel, enc.ciphertext.slice(0, CHUNK).buffer);
    expect(useTransferStore.getState().transfers['7001:0']!.loaded).toBe(CHUNK);

    for (let o = CHUNK; o < enc.ciphertext.length; o += CHUNK) await deliver(channel, enc.ciphertext.slice(o, o + CHUNK).buffer);
    await deliver(channel, JSON.stringify({ t: 'file-end', id: '7001:0' }));
    await vi.waitFor(() => expect(useTransferStore.getState().transfers['7001:0']).toMatchObject({ state: 'done' }));
    expect(attachments.urlFor('7001:0')).toBe('blob:p2p/1');
  });

  it('discards a file whose bytes were altered in transit', async () => {
    const { channel, attachments } = await connected();
    const { ref, enc } = await incomingFile('integrity matters');
    await deliver(channel, JSON.stringify({ t: 'msg', id: '7001', content: 'f', files: [ref] }));
    enc.ciphertext[2] = enc.ciphertext[2]! ^ 0xff;
    await stream(channel, ref, enc.ciphertext);
    await vi.waitFor(() => expect(useTransferStore.getState().transfers['7001:0']).toMatchObject({ state: 'error', reason: 'integrity' }));
    expect(attachments.urlFor('7001:0')).toBeNull();
  });

  it('aborts a file that sends more bytes than announced', async () => {
    const { channel } = await connected();
    const { ref, enc } = await incomingFile('short');
    await deliver(channel, JSON.stringify({ t: 'msg', id: '7001', content: 'f', files: [ref] }));
    await deliver(channel, JSON.stringify({ t: 'file', id: '7001:0', size: enc.ciphertext.length }));
    await deliver(channel, new Uint8Array(enc.ciphertext.length + 5).buffer);
    expect(useTransferStore.getState().transfers['7001:0']).toMatchObject({ state: 'error', reason: 'size_mismatch' });
  });

  it('ignores file frames for attachments the peer never announced', async () => {
    const { channel, attachments } = await connected();
    await deliver(channel, JSON.stringify({ t: 'file', id: '7001:0', size: 10 }));
    await deliver(channel, new Uint8Array(10).buffer);
    await deliver(channel, JSON.stringify({ t: 'file-end', id: '7001:0' }));
    expect(useTransferStore.getState().transfers['7001:0']).toBeUndefined();
    expect(attachments.urlFor('7001:0')).toBeNull();
  });

  it('marks unfinished transfers failed when the link closes', async () => {
    const { channel } = await connected();
    const { ref } = await incomingFile('abc');
    await deliver(channel, JSON.stringify({ t: 'msg', id: '7001', content: 'f', files: [ref] }));
    channel.onclose?.();
    await tick();
    expect(useTransferStore.getState().transfers['7001:0']).toMatchObject({ state: 'error', reason: 'peer_offline' });
  });

  it('refuses refs that are not bound to the message id or are oversize', async () => {
    const { channel } = await connected();
    const { ref } = await incomingFile('abc');
    await deliver(channel, JSON.stringify({ t: 'msg', id: '7001', content: 'f', files: [{ ...ref, id: '1:0' }, { ...ref, id: '7001:1', size: 65 * 1024 * 1024 }] }));
    expect(useMessageStore.getState().timelines['500']!.byId['7001']!.attachments).toHaveLength(0);
  });
});

