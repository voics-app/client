import { beforeEach, describe, expect, it } from 'vitest';
import { GatewayOp, type P2PSignal } from '../../../src/contracts/gateway';
import { DeviceDirectory } from '../../../src/application/privacy/deviceDirectory';
import { LocalHistory } from '../../../src/application/privacy/localHistory';
import { P2PService } from '../../../src/application/privacy/p2pService';
import { fingerprintSigningPayload } from '../../../src/domain/p2pIdentity';
import { utf8ToB64 } from '../../../src/application/privacy/types';
import { useMessageStore } from '../../../src/application/stores/messageStore';
import { usePrivacyStore } from '../../../src/application/stores/privacyStore';
import { BOB, FakeGateway, FakePeerConnection, SDP, SELF, asApi, dm, fakeApi, fakeCrypto, resetStores, tick } from './fakes';

function setup() {
  resetStores(dm('p2p'));
  const gateway = new FakeGateway();
  const { crypto } = fakeCrypto(gateway);
  const api = fakeApi({
    '2': [{ device_id: BOB.deviceId, identity_key_b64: BOB.identityKeyB64 }],
  });
  const connections: FakePeerConnection[] = [];
  const service = new P2PService({
    gateway,
    crypto,
    devices: new DeviceDirectory(asApi(api), () => 1_800_000_000_000),
    history: new LocalHistory(() => crypto),
    attachments: { prepareP2P: async () => [], accept: async () => undefined },
    getSelf: () => SELF,
    createPeerConnection: () => {
      const pc = new FakePeerConnection();
      connections.push(pc);
      return pc;
    },
    now: () => 1_800_000_000_000,
    connectTimeoutMs: 200,
    iceGatherTimeoutMs: 0,
  });
  return { service, gateway, crypto, connections };
}

const bindingB64 = (from: string, to: string) =>
  utf8ToB64(fingerprintSigningPayload({ channelId: '500', fromDeviceId: from, toDeviceId: to, fingerprint: 'sha-256 AA:BB' }));

const signalFromBob = (over: Partial<P2PSignal>): P2PSignal => ({
  channel_id: '500',
  to_user_id: '1',
  to_device_id: SELF.deviceId,
  from_user_id: '2',
  from_device_id: BOB.deviceId,
  kind: 'answer',
  payload: JSON.stringify({ type: 'answer', sdp: SDP() }),
  identity_sig_b64: `sig:${bindingB64(BOB.deviceId, SELF.deviceId)}`,
  ...over,
});

describe('P2PService dialling', () => {
  beforeEach(() => resetStores(dm('p2p')));

  it('sends candidates inside the offer once gathering ends, never as separate ice frames', async () => {
    const { service, gateway, connections } = setup();
    void service.send(dm('p2p'), { content: 'hi' }).catch(() => undefined);
    await tick();
    const pc = connections[0]!;
    pc.onicecandidate?.({ candidate: { toJSON: () => ({ candidate: 'candidate:1 1 udp 1 10.0.0.1 5000 typ host' }) } });
    pc.onicecandidate?.({ candidate: null });
    await tick();
    const kinds = (gateway.ofOp(GatewayOp.P2P_SIGNAL) as unknown as P2PSignal[]).map((s) => s.kind);
    expect(kinds).toEqual(['offer']);
  });

  it('offers with a signed DTLS fingerprint, then sends over the data channel once the verified answer arrives', async () => {
    const { service, gateway, connections } = setup();
    const pending = service.send(dm('p2p'), { content: 'hello directly' });
    await tick();

    const [offer] = gateway.ofOp(GatewayOp.P2P_SIGNAL) as unknown as P2PSignal[];
    expect(offer).toMatchObject({ kind: 'offer', to_user_id: '2', to_device_id: '20', from_device_id: '10' });
    expect(offer?.identity_sig_b64).toBe(`sig:${bindingB64(SELF.deviceId, BOB.deviceId)}`);

    await service.handleSignal(signalFromBob({}));
    connections[0]!.channel.open();
    const message = await pending;

    expect(connections[0]!.remote?.type).toBe('answer');
    expect(JSON.parse(connections[0]!.channel.sent[0]!)).toMatchObject({ t: 'msg', content: 'hello directly' });
    expect(gateway.sent.every((f) => f.op === GatewayOp.P2P_SIGNAL)).toBe(true);
    expect(message.deliveryMode).toBe('p2p');
    expect(useMessageStore.getState().timelines['500']?.byId[message.id]).toBeDefined();
    expect(usePrivacyStore.getState().p2p['500']).toMatchObject({ state: 'open', verified: true });
  });

  it('refuses an answer whose identity signature does not verify', async () => {
    const { service, connections } = setup();
    const pending = service.send(dm('p2p'), { content: 'hi' });
    await tick();
    await service.handleSignal(signalFromBob({ identity_sig_b64: 'sig:forged' }));
    await expect(pending).rejects.toMatchObject({ reason: 'unverified_peer' });
    expect(connections[0]!.remote).toBeNull();
    expect(connections[0]!.closed).toBe(true);
    expect(usePrivacyStore.getState().p2p['500']?.state).toBe('unverified');
  });

  it('refuses an answer whose SDP fingerprint differs from the one that was signed', async () => {
    const { service } = setup();
    const pending = service.send(dm('p2p'), { content: 'hi' });
    await tick();
    await service.handleSignal(signalFromBob({ payload: JSON.stringify({ type: 'answer', sdp: SDP('sha-256 EV:IL') }) }));
    await expect(pending).rejects.toMatchObject({ reason: 'unverified_peer' });
  });

  it('fails with peer offline when the gateway reports the peer has no session, queueing nothing', async () => {
    const { service, gateway } = setup();
    const pending = service.send(dm('p2p'), { content: 'hi' });
    await tick();
    service.handleSignalFailed({ channel_id: '500', to_user_id: '2', to_device_id: '20', error: 'peer_offline' });
    await expect(pending).rejects.toMatchObject({ reason: 'peer_offline' });
    expect(usePrivacyStore.getState().p2p['500']?.state).toBe('peer_offline');
    expect(useMessageStore.getState().timelines['500']).toBeUndefined();
    expect(gateway.ofOp(GatewayOp.E2EE_ENVELOPE)).toHaveLength(0);
  });

  it('times out as peer offline when nobody answers', async () => {
    const { service } = setup();
    await expect(service.send(dm('p2p'), { content: 'hi' })).rejects.toMatchObject({ reason: 'peer_offline' });
  });

  it('buffers early ICE candidates until the remote description is set', async () => {
    const { service, connections } = setup();
    const pending = service.send(dm('p2p'), { content: 'hi' });
    await tick();
    await service.handleSignal(signalFromBob({ kind: 'ice', payload: JSON.stringify({ candidate: 'c1' }), identity_sig_b64: '' }));
    expect(connections[0]!.candidates).toHaveLength(0);
    await service.handleSignal(signalFromBob({}));
    expect(connections[0]!.candidates).toEqual([{ candidate: 'c1' }]);
    connections[0]!.channel.open();
    await pending;
  });
});

describe('P2PService answering', () => {
  it('answers a verified offer with its own signed fingerprint', async () => {
    const { service, gateway, connections } = setup();
    await service.handleSignal(
      signalFromBob({ kind: 'offer', payload: JSON.stringify({ type: 'offer', sdp: SDP() }), identity_sig_b64: `sig:${bindingB64(BOB.deviceId, SELF.deviceId)}` }),
    );
    const [answer] = gateway.ofOp(GatewayOp.P2P_SIGNAL) as unknown as P2PSignal[];
    expect(answer).toMatchObject({ kind: 'answer', to_device_id: '20' });
    expect(answer?.identity_sig_b64).toBe(`sig:${bindingB64(SELF.deviceId, BOB.deviceId)}`);
    expect(connections).toHaveLength(1);
  });

  it('ignores an unverified offer and marks the chat unverified', async () => {
    const { service, gateway, connections } = setup();
    await service.handleSignal(signalFromBob({ kind: 'offer', payload: JSON.stringify({ type: 'offer', sdp: SDP() }), identity_sig_b64: '' }));
    expect(gateway.sent).toHaveLength(0);
    expect(connections).toHaveLength(0);
    expect(usePrivacyStore.getState().p2p['500']?.state).toBe('unverified');
  });

  it('shows messages arriving over the channel as authored by the verified peer, not by a claimed author', async () => {
    const { service, connections } = setup();
    await service.handleSignal(
      signalFromBob({ kind: 'offer', payload: JSON.stringify({ type: 'offer', sdp: SDP() }), identity_sig_b64: `sig:${bindingB64(BOB.deviceId, SELF.deviceId)}` }),
    );
    const channel = connections[0]!.channel;
    connections[0]!.ondatachannel?.({ channel });
    channel.open();
    channel.onmessage?.({
      data: JSON.stringify({ t: 'msg', id: '7001', content: 'direct', timestamp: '2026-10-17T10:00:00.000Z', author: { id: '99' } }),
    });
    await tick();
    const message = useMessageStore.getState().timelines['500']?.byId['7001'];
    expect(message?.author.id).toBe('2');
    expect(message?.deliveryMode).toBe('p2p');
  });

  it('computes an order-independent safety number', async () => {
    const { service } = setup();
    const groups = await service.safetyNumber('2', '20');
    expect(groups).toHaveLength(12);
    expect(groups.every((g) => /^\d{5}$/.test(g))).toBe(true);
  });
});
