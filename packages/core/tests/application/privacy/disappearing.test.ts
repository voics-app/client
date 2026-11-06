import { beforeEach, describe, expect, it } from 'vitest';
import { GatewayOp, type E2EEEnvelope, type P2PSignal } from '../../../src/contracts/gateway';
import { decodeControl, encodeControl, parseControl } from '../../../src/application/privacy/control';
import { DeviceDirectory } from '../../../src/application/privacy/deviceDirectory';
import { EphemeralService } from '../../../src/application/privacy/ephemeralService';
import { LocalHistory } from '../../../src/application/privacy/localHistory';
import { P2PService } from '../../../src/application/privacy/p2pService';
import { PrivateRetention } from '../../../src/application/privacy/retention';
import { utf8ToB64 } from '../../../src/application/privacy/types';
import { fingerprintSigningPayload } from '../../../src/domain/p2pIdentity';
import { parseTtl } from '../../../src/domain/disappearing';
import { useMessageStore } from '../../../src/application/stores/messageStore';
import { usePrivacyStore } from '../../../src/application/stores/privacyStore';
import { BOB, FakeGateway, FakePeerConnection, SDP, SELF, asApi, dm, fakeApi, fakeCrypto, resetStores, tick } from './fakes';

const T0 = 1_800_000_000_000;
const timeline = () => useMessageStore.getState().timelines['500']?.byId ?? {};

describe('control messages', () => {
  it('round-trips a delete and a timer, and rejects malformed frames', () => {
    expect(decodeControl(encodeControl({ kind: 'delete', messageId: '9000' }))).toEqual({ kind: 'delete', messageId: '9000' });
    expect(decodeControl(encodeControl({ kind: 'timer', ttlMs: 3_600_000 }))).toEqual({ kind: 'timer', ttlMs: 3_600_000 });
    expect(decodeControl(encodeControl({ kind: 'timer', ttlMs: null }))).toEqual({ kind: 'timer', ttlMs: null });
    expect(parseControl({ v: 1, ctl: 'delete', target: '../x' })).toBeNull();
    expect(parseControl({ v: 1, ctl: 'timer', ttl_ms: 1 })).toBeNull();
    expect(parseControl({ v: 2, ctl: 'delete', target: '1' })).toBeNull();
    expect(decodeControl(utf8ToB64(JSON.stringify({ v: 1, content: 'hi', nonce: '1', timestamp: 't' })))).toBeNull();
  });

  it('only accepts timers inside the allowed range', () => {
    expect(parseTtl(60_000)).toBe(60_000);
    expect(parseTtl(10)).toBeNull();
    expect(parseTtl(1e12)).toBeNull();
    expect(parseTtl('60000')).toBeNull();
  });
});

function ephemeral() {
  resetStores();
  const gateway = new FakeGateway();
  const { crypto, records, encryptFake } = fakeCrypto(gateway);
  let clock = T0;
  const api = fakeApi({
    '1': [{ device_id: SELF.deviceId, identity_key_b64: SELF.identityKeyB64 }],
    '2': [{ device_id: BOB.deviceId, identity_key_b64: BOB.identityKeyB64 }],
  });
  const history = new LocalHistory(() => crypto, () => clock);
  const service = new EphemeralService({
    gateway,
    api: asApi(api),
    crypto,
    devices: new DeviceDirectory(asApi(api), () => clock),
    history,
    attachments: { prepareCdn: async () => [] },
    getSelf: () => SELF,
    now: () => clock,
  });
  const retention = new PrivateRetention(history, () => clock);
  const said = (messageId: string, body: object, sender = BOB.deviceId): E2EEEnvelope => ({
    channel_id: '500',
    message_id: messageId,
    sender_device_id: sender,
    recipients: [{ user_id: '1', device_id: SELF.deviceId, ciphertext_b64: encryptFake(utf8ToB64(JSON.stringify(body))) }],
    mls_epoch: 2,
    content_type: 'application',
  });
  const text = (id: string) => ({ v: 1, content: 'secret', nonce: id, timestamp: '2026-10-17T10:00:00.000Z' });
  return { service, gateway, crypto, records, retention, said, text, advance: (ms: number) => (clock += ms) };
}

describe('Ephemeral delete for everyone', () => {
  beforeEach(() => resetStores());

  it('relays an encrypted delete to the other devices and removes the content here', async () => {
    const { service, gateway, crypto } = ephemeral();
    const sent = await service.send(dm(), { content: 'regret' });
    gateway.sent.length = 0;

    await service.deleteForEveryone(dm(), sent.id);

    const frames = gateway.ofOp(GatewayOp.E2EE_ENVELOPE) as unknown as E2EEEnvelope[];
    expect(frames).toHaveLength(1);
    expect(frames[0]?.content_type).toBe('application');
    expect(frames[0]?.recipients.map((r) => r.device_id)).toEqual(['20']);
    expect(JSON.stringify(frames)).not.toContain('delete');
    expect(crypto.deleteMessage).toHaveBeenCalledWith('500', sent.id);
    expect(timeline()[sent.id]).toBeUndefined();
  });

  it('refuses to delete a message somebody else wrote', async () => {
    const { service, said, text } = ephemeral();
    await service.send(dm(), { content: 'hello' });
    await service.handleEnvelope(said('9000', text('9000')));
    await expect(service.deleteForEveryone(dm(), '9000')).rejects.toMatchObject({ reason: 'unsupported' });
    expect(timeline()['9000']).toBeDefined();
  });

  it('honours a delete from the author, removes it from the local store and acknowledges it', async () => {
    const { service, gateway, crypto, said, text } = ephemeral();
    await service.handleEnvelope(said('9000', text('9000')));
    expect(timeline()['9000']).toBeDefined();

    await service.handleEnvelope(said('9001', { v: 1, ctl: 'delete', target: '9000' }));

    expect(timeline()['9000']).toBeUndefined();
    expect(crypto.deleteMessage).toHaveBeenCalledWith('500', '9000');
    expect(gateway.ofOp(GatewayOp.E2EE_ACK)).toEqual([{ message_ids: ['9000'] }, { message_ids: ['9001'] }]);
  });

  it('ignores a delete aimed at a message the sender did not write', async () => {
    const { service, crypto, said, retention } = ephemeral();
    const mine = await service.send(dm(), { content: 'mine' });
    await service.handleEnvelope(said('9001', { v: 1, ctl: 'delete', target: mine.id }));
    expect(timeline()[mine.id]).toBeDefined();
    expect(crypto.deleteMessage).not.toHaveBeenCalled();
    expect(await retention.wasDeleted('500', mine.id, '2')).toBe(false);
  });

  it('drops a message whose delete arrived first (offline catch-up out of order)', async () => {
    const { service, said, text } = ephemeral();
    await service.handleEnvelope(said('9001', { v: 1, ctl: 'delete', target: '9000' }));
    await service.handleEnvelope(said('9000', text('9000')));
    expect(timeline()['9000']).toBeUndefined();
  });

  it('does not let a tombstone of one user hide another user message', async () => {
    const { retention } = ephemeral();
    await retention.applyDelete('500', '2', '9000');
    expect(await retention.wasDeleted('500', '9000', '2')).toBe(true);
    expect(await retention.wasDeleted('500', '9000', '1')).toBe(false);
  });

  it('ignores a delete from a device that belongs to nobody in the chat', async () => {
    const { service, said, text } = ephemeral();
    await service.handleEnvelope(said('9000', text('9000')));
    await service.handleEnvelope(said('9001', { v: 1, ctl: 'delete', target: '9000' }, '999'));
    expect(timeline()['9000']).toBeDefined();
  });
});

describe('Ephemeral disappearing messages', () => {
  beforeEach(() => resetStores());

  it('stamps outgoing messages with the chat timer and removes them once it runs out', async () => {
    const { service, retention, advance, crypto } = ephemeral();
    await retention.setTimer('500', 60_000);
    const sent = await service.send(dm(), { content: 'brief' });
    expect(sent.expiresAt).toBe(T0 + 60_000);

    advance(59_000);
    await retention.sweep();
    expect(timeline()[sent.id]).toBeDefined();

    advance(2_000);
    await retention.sweep();
    expect(timeline()[sent.id]).toBeUndefined();
    expect(crypto.deleteMessage).toHaveBeenCalledWith('500', sent.id);
  });

  it('expires a received message from its arrival and purges it from the store when the chat is loaded', async () => {
    const { service, said, text, crypto } = ephemeral();
    await service.handleEnvelope(said('9000', { ...text('9000'), ttl_ms: 60_000 }));
    expect(timeline()['9000']?.expiresAt).toBe(T0 + 60_000);

    const later = new LocalHistory(() => crypto, () => T0 + 61_000);
    expect(await later.list('500', null, 10)).toEqual([]);
    expect(crypto.deleteMessage).toHaveBeenCalledWith('500', '9000');
  });

  it('applies a timer control from the peer and persists it', async () => {
    const { service, said, records } = ephemeral();
    await service.handleEnvelope(said('9002', { v: 1, ctl: 'timer', ttl_ms: 3_600_000 }));
    expect(usePrivacyStore.getState().timers['500']).toBe(3_600_000);
    expect(JSON.parse(records.get('__state:disappear-timers/state')!.json)).toEqual({ '500': 3_600_000 });
    await service.handleEnvelope(said('9003', { v: 1, ctl: 'timer', ttl_ms: null }));
    expect(usePrivacyStore.getState().timers['500']).toBeUndefined();
  });

  it('announces a timer change only as ciphertext', async () => {
    const { service, gateway } = ephemeral();
    await service.announceTimer(dm(), 3_600_000);
    const frames = gateway.ofOp(GatewayOp.E2EE_ENVELOPE) as unknown as E2EEEnvelope[];
    expect(frames.at(-1)?.content_type).toBe('application');
    expect(JSON.stringify(frames.at(-1))).not.toContain('3600000');
  });

  it('loads the saved timers again after a restart', async () => {
    const { retention } = ephemeral();
    await retention.setTimer('500', 3_600_000);
    usePrivacyStore.getState().loadTimers({});
    await retention.load();
    expect(usePrivacyStore.getState().timers['500']).toBe(3_600_000);
  });
});

function p2p() {
  resetStores(dm('p2p'));
  const gateway = new FakeGateway();
  const { crypto } = fakeCrypto(gateway);
  const api = fakeApi({ '2': [{ device_id: BOB.deviceId, identity_key_b64: BOB.identityKeyB64 }] });
  const connections: FakePeerConnection[] = [];
  const service = new P2PService({
    gateway,
    crypto,
    devices: new DeviceDirectory(asApi(api), () => T0),
    history: new LocalHistory(() => crypto, () => T0),
    attachments: { prepareP2P: async () => [], accept: async () => undefined },
    getSelf: () => SELF,
    createPeerConnection: () => {
      const pc = new FakePeerConnection();
      connections.push(pc);
      return pc;
    },
    now: () => T0,
    connectTimeoutMs: 100,
    iceGatherTimeoutMs: 0,
  });
  const answer: P2PSignal = {
    channel_id: '500',
    to_user_id: '1',
    to_device_id: SELF.deviceId,
    from_user_id: '2',
    from_device_id: BOB.deviceId,
    kind: 'answer',
    payload: JSON.stringify({ type: 'answer', sdp: SDP() }),
    identity_sig_b64: `sig:${utf8ToB64(fingerprintSigningPayload({ channelId: '500', fromDeviceId: BOB.deviceId, toDeviceId: SELF.deviceId, fingerprint: 'sha-256 AA:BB' }))}`,
  };
  /** Lets the pending dial send its offer, then has the peer answer and open the channel. */
  const peerAnswers = async () => {
    await tick();
    await service.handleSignal(answer);
    connections.at(-1)!.channel.open();
  };
  return { service, connections, peerAnswers, crypto };
}

const frameFrom = (pc: FakePeerConnection, body: object) => pc.channel.onmessage?.({ data: JSON.stringify(body) });
const sentFrames = (pc: FakePeerConnection) => pc.channel.sent.map((s) => JSON.parse(s) as Record<string, unknown>);

describe('P2P delete for everyone', () => {
  it('sends the delete over the verified channel and removes the message here', async () => {
    const { service, connections, peerAnswers, crypto } = p2p();
    const sending = service.send(dm('p2p'), { content: 'oops' });
    await peerAnswers();
    const sent = await sending;

    await service.deleteForEveryone(dm('p2p'), sent.id);

    expect(sentFrames(connections[0]!).at(-1)).toMatchObject({ t: 'ctl', ctl: 'delete', target: sent.id });
    expect(timeline()[sent.id]).toBeUndefined();
    expect(crypto.deleteMessage).toHaveBeenCalledWith('500', sent.id);
  });

  it('keeps a pending delete for an offline peer and delivers it once the devices connect again', async () => {
    const { service, connections, peerAnswers, crypto } = p2p();
    const sending = service.send(dm('p2p'), { content: 'hi' });
    await peerAnswers();
    const sent = await sending;
    // The link drops: the peer is no longer reachable.
    connections[0]!.channel.readyState = 'closed';
    connections[0]!.onconnectionstatechange?.();
    connections[0]!.connectionState = 'failed';
    connections[0]!.onconnectionstatechange?.();

    await service.deleteForEveryone(dm('p2p'), sent.id);
    expect(timeline()[sent.id]).toBeUndefined();
    expect(crypto.putMessage).toHaveBeenCalledWith(expect.objectContaining({ channelId: '__state:p2p-pending-deletes' }));

    const flushing = service.flushPending();
    await peerAnswers();
    await flushing;
    await tick();
    expect(sentFrames(connections.at(-1)!)).toContainEqual(expect.objectContaining({ ctl: 'delete', target: sent.id }));
  });

  it('honours the peer deleting its own message and ignores a delete of ours', async () => {
    const { service, connections, peerAnswers } = p2p();
    const sending = service.send(dm('p2p'), { content: 'mine' });
    await peerAnswers();
    const mine = await sending;
    const pc = connections[0]!;

    frameFrom(pc, { t: 'msg', id: '9000', v: 1, content: 'theirs', nonce: '9000', timestamp: '2026-10-17T10:00:00.000Z', ttl_ms: 60_000 });
    await tick();
    expect(timeline()['9000']?.expiresAt).toBe(T0 + 60_000);

    frameFrom(pc, { t: 'ctl', v: 1, ctl: 'delete', target: mine.id });
    await tick();
    expect(timeline()[mine.id]).toBeDefined();

    frameFrom(pc, { t: 'ctl', v: 1, ctl: 'delete', target: '9000' });
    await tick();
    expect(timeline()['9000']).toBeUndefined();
  });

  it('refuses to delete a message the peer wrote', async () => {
    const { service, connections, peerAnswers } = p2p();
    const sending = service.send(dm('p2p'), { content: 'mine' });
    await peerAnswers();
    await sending;
    frameFrom(connections[0]!, { t: 'msg', id: '9000', v: 1, content: 'theirs', nonce: '9000', timestamp: '2026-10-17T10:00:00.000Z' });
    await tick();
    await expect(service.deleteForEveryone(dm('p2p'), '9000')).rejects.toMatchObject({ reason: 'unsupported' });
  });
});
