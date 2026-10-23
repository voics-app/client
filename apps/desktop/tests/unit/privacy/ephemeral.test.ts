import { beforeEach, describe, expect, it } from 'vitest';
import { GatewayOp, type E2EEEnvelope } from '@shared/contracts/gateway';
import { DeviceDirectory } from '@renderer/application/privacy/deviceDirectory';
import { EphemeralService } from '@renderer/application/privacy/ephemeralService';
import { LocalHistory } from '@renderer/application/privacy/localHistory';
import { PrivateDeliveryError, utf8ToB64 } from '@renderer/application/privacy/types';
import { useMessageStore } from '@renderer/application/stores/messageStore';
import { usePrivacyStore } from '@renderer/application/stores/privacyStore';
import { BOB, FakeGateway, SELF, asApi, dm, fakeApi, fakeCrypto, resetStores } from './fakes';

const SECRET = 'meet at the old bridge at nine';

function setup(options: { available?: boolean; noCrypto?: boolean; onIncoming?: (m: unknown) => void } = {}) {
  resetStores();
  const gateway = new FakeGateway();
  const { crypto, records, encryptFake } = fakeCrypto(gateway, options.available ?? true);
  const bridge = options.noCrypto ? undefined : crypto;
  let clock = 1_800_000_000_000;
  const api = fakeApi({
    '1': [{ device_id: SELF.deviceId, identity_key_b64: SELF.identityKeyB64 }],
    '2': [{ device_id: BOB.deviceId, identity_key_b64: BOB.identityKeyB64 }],
  });
  const devices = new DeviceDirectory(asApi(api), () => clock);
  const service = new EphemeralService({
    gateway,
    api: asApi(api),
    crypto: bridge,
    devices,
    history: new LocalHistory(() => bridge),
    attachments: { prepareCdn: async () => [] },
    getSelf: () => SELF,
    now: () => clock,
    onIncoming: options.onIncoming,
  });
  return { service, gateway, crypto, api, records, encryptFake, advance: (ms: number) => (clock += ms) };
}

const envelope = (over: Partial<E2EEEnvelope> & { ciphertext?: string } = {}): E2EEEnvelope => {
  const { ciphertext, ...rest } = over;
  return {
    channel_id: '500',
    message_id: '9000',
    sender_device_id: BOB.deviceId,
    recipients: [{ user_id: '1', device_id: SELF.deviceId, ciphertext_b64: ciphertext ?? 'x' }],
    mls_epoch: 2,
    content_type: 'application',
    ...rest,
  };
};

describe('EphemeralService sending', () => {
  beforeEach(() => resetStores());

  it('creates the group, welcomes the peer device and relays only ciphertext over op 20', async () => {
    const { service, gateway, crypto, api } = setup();
    const message = await service.send(dm(), { content: SECRET });

    expect(crypto.createGroup).toHaveBeenCalledWith('500');
    expect(api.claimKeyPackage).toHaveBeenCalledWith('2', '20');
    expect(crypto.addMembers).toHaveBeenCalledWith('500', ['pkg:2:20']);
    const [welcome, app] = gateway.ofOp(GatewayOp.E2EE_ENVELOPE) as unknown as E2EEEnvelope[];
    expect(welcome?.content_type).toBe('welcome');
    expect(welcome?.recipients).toEqual([{ user_id: '2', device_id: '20', ciphertext_b64: btoa('welcome') }]);
    expect(app?.content_type).toBe('application');
    expect(app?.recipients.map((r) => r.device_id)).toEqual(['20']);
    expect(app?.sender_device_id).toBe('10');

    const wire = JSON.stringify(gateway.sent);
    expect(wire).not.toContain(SECRET);
    expect(wire).not.toContain(utf8ToB64(SECRET).slice(0, 20));
    expect(message.deliveryMode).toBe('ephemeral');
    expect(useMessageStore.getState().timelines['500']?.byId[message.id]?.content).toBe(SECRET);
    expect(usePrivacyStore.getState().groups['500']?.state).toBe('ready');
  });

  it('persists the sent message in the local encrypted store', async () => {
    const { service, records } = setup();
    const message = await service.send(dm(), { content: SECRET });
    expect(JSON.parse(records.get(`500/${message.id}`)!.json).content).toBe(SECRET);
  });

  it('fails hard and sends nothing when the native crypto module is missing', async () => {
    const { service, gateway } = setup({ noCrypto: true });
    await expect(service.send(dm(), { content: SECRET })).rejects.toMatchObject({ reason: 'encryption_unavailable' });
    expect(gateway.sent).toHaveLength(0);
    expect(useMessageStore.getState().timelines['500']).toBeUndefined();
  });

  it('fails hard when the native module reports itself unavailable', async () => {
    const { service, gateway } = setup({ available: false });
    const error = await service.send(dm(), { content: SECRET }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PrivateDeliveryError);
    expect((error as Error).message).toContain('native module missing');
    expect(gateway.sent).toHaveLength(0);
  });

  it('refuses to send when no other device can receive', async () => {
    const { service, gateway, api } = setup();
    api.listUserDevices.mockImplementation(async (id: string) => (id === '1' ? [{ device_id: '10', identity_key_b64: 'key-self' }] : []));
    await expect(service.send(dm(), { content: 'hi' })).rejects.toMatchObject({ reason: 'no_recipients' });
    expect(gateway.ofOp(GatewayOp.E2EE_ENVELOPE)).toHaveLength(0);
  });

  it('adds a newly appeared device with a commit to existing members and a welcome to the newcomer', async () => {
    const { service, gateway, api, advance, crypto } = setup();
    await service.send(dm(), { content: 'one' });
    api.listUserDevices.mockImplementation(async (id: string) =>
      id === '2'
        ? [
            { device_id: '20', identity_key_b64: 'key-bob' },
            { device_id: '21', identity_key_b64: 'key-bob-2' },
          ]
        : [{ device_id: '10', identity_key_b64: 'key-self' }],
    );
    advance(120_000);
    gateway.sent.length = 0;
    await service.send(dm(), { content: 'two' });

    expect(crypto.addMembers).toHaveBeenLastCalledWith('500', ['pkg:2:21']);
    const frames = gateway.ofOp(GatewayOp.E2EE_ENVELOPE) as unknown as E2EEEnvelope[];
    expect(frames.map((f) => f.content_type)).toEqual(['commit', 'welcome', 'application']);
    expect(frames[0]?.recipients.map((r) => r.device_id)).toEqual(['20']);
    expect(frames[1]?.recipients.map((r) => r.device_id)).toEqual(['21']);
    expect(frames[2]?.recipients.map((r) => r.device_id).sort()).toEqual(['20', '21']);
  });
});

describe('EphemeralService duplicate identity keys', () => {
  it('adds only one device per identity key (re-registered rows share a signature key)', async () => {
    const { service, api, crypto } = setup();
    api.listUserDevices.mockImplementation(async (id: string) =>
      id === '2'
        ? [
            { device_id: '20', identity_key_b64: 'key-bob' },
            { device_id: '22', identity_key_b64: 'key-bob' },
          ]
        : [
            { device_id: '10', identity_key_b64: 'key-self' },
            { device_id: '9', identity_key_b64: 'key-self' },
          ],
    );
    await service.send(dm(), { content: 'hi' });
    expect(crypto.addMembers).toHaveBeenCalledTimes(1);
    expect(crypto.addMembers).toHaveBeenCalledWith('500', ['pkg:2:22']);
  });

  it('skips devices whose identity key is already a group member', async () => {
    const { service, api, crypto, advance } = setup();
    await service.send(dm(), { content: 'one' });
    crypto.memberKeys.mockResolvedValue(['key-self', 'key-bob']);
    api.listUserDevices.mockImplementation(async (id: string) =>
      id === '2'
        ? [
            { device_id: '20', identity_key_b64: 'key-bob' },
            { device_id: '23', identity_key_b64: 'key-bob' },
          ]
        : [{ device_id: '10', identity_key_b64: 'key-self' }],
    );
    advance(120_000);
    crypto.addMembers.mockClear();
    await service.send(dm(), { content: 'two' });
    expect(crypto.addMembers).not.toHaveBeenCalled();
  });
});

describe('EphemeralService receiving', () => {
  it('joins on a welcome and acknowledges it', async () => {
    const { service, gateway, crypto } = setup();
    await service.handleEnvelope(envelope({ content_type: 'welcome', ciphertext: 'welcome-bytes' }));
    expect(crypto.joinFromWelcome).toHaveBeenCalledWith('welcome-bytes');
    expect(usePrivacyStore.getState().groups['500']?.state).toBe('ready');
    expect(gateway.ofOp(GatewayOp.E2EE_ACK)).toEqual([{ message_ids: ['9000'] }]);
  });

  it('replaces its own lone local group when a welcome for the same group arrives (client#118)', async () => {
    const { service, gateway, crypto } = setup();
    await crypto.createGroup('500');
    crypto.memberKeys.mockResolvedValue(['key-self']);
    await service.handleEnvelope(envelope({ content_type: 'welcome', ciphertext: 'welcome-bytes' }));
    expect(crypto.deleteGroup).toHaveBeenCalledWith('500');
    expect(crypto.joinFromWelcome).toHaveBeenCalledWith('welcome-bytes');
    expect(gateway.ofOp(GatewayOp.E2EE_ACK)).toEqual([{ message_ids: ['9000'] }]);
  });

  it('on a split-brain race the group of the lower identity key wins and our unread messages are re-sent', async () => {
    const { service, gateway, crypto } = setup();
    await service.send(dm(), { content: 'raced' });
    gateway.sent.length = 0;
    crypto.memberKeys.mockResolvedValue(['key-self', 'key-bob']);
    await service.handleEnvelope(envelope({ content_type: 'welcome', ciphertext: 'welcome-bytes' }));
    expect(crypto.deleteGroup).toHaveBeenCalledWith('500');
    const resent = gateway.ofOp(GatewayOp.E2EE_ENVELOPE) as unknown as E2EEEnvelope[];
    expect(resent.map((e) => e.content_type)).toEqual(['application']);
    expect(resent[0]?.recipients.map((r) => r.device_id)).toEqual(['20']);
  });

  it('drops an application message it can never decrypt instead of retrying forever', async () => {
    const { service, gateway, crypto } = setup();
    crypto.processIncoming.mockRejectedValueOnce(new Error('MLS error: ValidationError(UnableToDecrypt(AeadError))'));
    await service.handleEnvelope(envelope());
    expect(gateway.ofOp(GatewayOp.E2EE_ACK)).toEqual([{ message_ids: ['9000'] }]);
  });

  it('decrypts, persists locally, displays, and only then acknowledges', async () => {
    const { service, gateway, encryptFake } = setup();
    const payload = { v: 1, content: SECRET, nonce: '9000', timestamp: '2026-10-17T10:00:00.000Z' };
    await service.handleEnvelope(envelope({ ciphertext: encryptFake(utf8ToB64(JSON.stringify(payload))) }));

    const message = useMessageStore.getState().timelines['500']?.byId['9000'];
    expect(message?.content).toBe(SECRET);
    expect(message?.author.id).toBe('2');
    expect(message?.deliveryMode).toBe('ephemeral');
    expect(gateway.log.indexOf('persist')).toBeGreaterThanOrEqual(0);
    expect(gateway.log.indexOf('persist')).toBeLessThan(gateway.log.indexOf(`gw:${GatewayOp.E2EE_ACK}`));
  });

  it('reports a decrypted incoming message once so unread/mention/notification run (client#154)', async () => {
    const seen: unknown[] = [];
    const { service, encryptFake } = setup({ onIncoming: (m) => seen.push(m) });
    const payload = { v: 1, content: SECRET, nonce: '9000', timestamp: '2026-10-17T10:00:00.000Z' };
    const env = envelope({ ciphertext: encryptFake(utf8ToB64(JSON.stringify(payload))) });
    await service.handleEnvelope(env);
    await service.handleEnvelope(env);
    expect(seen).toHaveLength(1);
    expect((seen[0] as { content: string; deliveryMode: string }).deliveryMode).toBe('ephemeral');
  });

  it('does not acknowledge when decryption fails, so the relay keeps the entry', async () => {
    const { service, gateway, crypto } = setup();
    crypto.processIncoming.mockRejectedValueOnce(new Error('epoch mismatch'));
    await service.handleEnvelope(envelope());
    expect(gateway.ofOp(GatewayOp.E2EE_ACK)).toHaveLength(0);
    expect(usePrivacyStore.getState().groups['500']).toMatchObject({ state: 'error', detail: 'epoch mismatch' });
  });

  it('drops messages from a device that belongs to nobody in the channel', async () => {
    const { service, gateway, encryptFake } = setup();
    const payload = { v: 1, content: 'spoof', nonce: '1', timestamp: '2026-10-17T10:00:00.000Z' };
    await service.handleEnvelope(envelope({ sender_device_id: '999', ciphertext: encryptFake(utf8ToB64(JSON.stringify(payload))) }));
    expect(useMessageStore.getState().timelines['500']).toBeUndefined();
    expect(gateway.ofOp(GatewayOp.E2EE_ACK)).toHaveLength(1);
  });

  it('accepts a message from another device of our own user (multi-device mirror)', async () => {
    const { service, gateway, api, encryptFake } = setup();
    api.listUserDevices.mockImplementation(async (id: string) =>
      id === '1'
        ? [
            { device_id: '10', identity_key_b64: 'key-self' },
            { device_id: '11', identity_key_b64: 'key-self-2' },
          ]
        : [{ device_id: '20', identity_key_b64: 'key-bob' }],
    );
    const payload = { v: 1, content: 'from my other device', nonce: '77', timestamp: '2026-10-17T10:00:00.000Z' };
    await service.handleEnvelope(envelope({ message_id: '77', sender_device_id: '11', ciphertext: encryptFake(utf8ToB64(JSON.stringify(payload))) }));
    const shown = useMessageStore.getState().timelines['500']?.byId['77'];
    expect(shown?.content).toBe('from my other device');
    expect(shown?.author.id).toBe('1');
    expect(gateway.ofOp(GatewayOp.E2EE_ACK)).toEqual([{ message_ids: ['77'] }]);
  });

  it('uploads a key package batch on start and not again within a day', async () => {
    const { service, api, crypto } = setup();
    await service.start();
    await service.start();
    expect(crypto.generateKeyPackages).toHaveBeenCalledTimes(1);
    expect(api.uploadKeyPackages).toHaveBeenCalledWith('10', expect.any(Array));
  });
});
