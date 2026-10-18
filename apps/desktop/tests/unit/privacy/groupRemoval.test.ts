import { beforeEach, describe, expect, it } from 'vitest';
import { GatewayOp, type E2EEEnvelope } from '@shared/contracts/gateway';
import { DeviceDirectory } from '@renderer/application/privacy/deviceDirectory';
import { EphemeralService } from '@renderer/application/privacy/ephemeralService';
import { mayCommit } from '@renderer/application/privacy/groupRemoval';
import { LocalHistory } from '@renderer/application/privacy/localHistory';
import { PrivateMessaging } from '@renderer/application/privacy/privateMessaging';
import { usePrivacyStore } from '@renderer/application/stores/privacyStore';
import { BOB, FakeGateway, asApi, dm, fakeApi, fakeCrypto, resetStores } from './fakes';

const CAROL = { userId: '3', deviceId: '30', identityKeyB64: 'key-carol' };
const LOW_SELF = { userId: '1', deviceId: '10', identityKeyB64: 'aaa-self' };
const HIGH_SELF = { userId: '1', deviceId: '10', identityKeyB64: 'zzz-self' };

function setup(self = LOW_SELF) {
  resetStores();
  const gateway = new FakeGateway();
  const { crypto, groups } = fakeCrypto(gateway);
  groups.add('500');
  const api = fakeApi({
    '1': [{ device_id: self.deviceId, identity_key_b64: self.identityKeyB64 }],
    '2': [{ device_id: BOB.deviceId, identity_key_b64: BOB.identityKeyB64 }],
    '3': [{ device_id: CAROL.deviceId, identity_key_b64: CAROL.identityKeyB64 }],
  });
  const service = new EphemeralService({
    gateway,
    api: asApi(api),
    crypto,
    devices: new DeviceDirectory(asApi(api), () => 0),
    history: new LocalHistory(() => crypto),
    getSelf: () => self,
    now: () => 1_800_000_000_000,
  });
  return { service, gateway, crypto, api };
}

const envelopes = (gateway: FakeGateway) => gateway.ofOp(GatewayOp.E2EE_ENVELOPE) as unknown as E2EEEnvelope[];
const commits = (gateway: FakeGateway) => envelopes(gateway).filter((e) => e.content_type === 'commit');

const incomingCommit = (self: { deviceId: string }, messageId = '1'): E2EEEnvelope => ({
  channel_id: '500',
  message_id: messageId,
  sender_device_id: BOB.deviceId,
  recipients: [{ user_id: '1', device_id: self.deviceId, ciphertext_b64: 'x' }],
  mls_epoch: 8,
  content_type: 'commit',
});

describe('MLS member removal', () => {
  beforeEach(() => resetStores());

  it('commits the removal of a device whose user left the channel and relays it to the remaining devices', async () => {
    const { service, gateway, crypto } = setup();
    crypto.memberKeys.mockResolvedValue([LOW_SELF.identityKeyB64, BOB.identityKeyB64, CAROL.identityKeyB64]);
    crypto.removeMembers.mockResolvedValue({ commitB64: 'remove-commit', epoch: 7 });

    await service.reconcileMembership('500');

    expect(crypto.removeMembers).toHaveBeenCalledWith('500', [CAROL.identityKeyB64]);
    const [commit] = commits(gateway);
    expect(commit?.mls_epoch).toBe(7);
    expect(commit?.recipients).toEqual([{ user_id: '2', device_id: '20', ciphertext_b64: 'remove-commit' }]);
    expect(usePrivacyStore.getState().groups['500']?.epoch).toBe(7);
  });

  it('removes a device that was unlinked from a participant', async () => {
    const { service, crypto } = setup();
    crypto.memberKeys.mockResolvedValue([LOW_SELF.identityKeyB64, BOB.identityKeyB64, 'key-bob-old-phone']);
    crypto.removeMembers.mockResolvedValue({ commitB64: 'c', epoch: 4 });

    await service.reconcileMembership('500');

    expect(crypto.removeMembers).toHaveBeenCalledWith('500', ['key-bob-old-phone']);
  });

  it('commits nothing when the group already matches the participants', async () => {
    const { service, crypto, gateway } = setup();
    crypto.memberKeys.mockResolvedValue([LOW_SELF.identityKeyB64, BOB.identityKeyB64]);
    await service.reconcileMembership('500');
    expect(crypto.removeMembers).not.toHaveBeenCalled();
    expect(commits(gateway)).toHaveLength(0);
  });

  it('leaves the removal to the elected committer, and takes over on retry', async () => {
    const { service, crypto } = setup(HIGH_SELF);
    crypto.memberKeys.mockResolvedValue([HIGH_SELF.identityKeyB64, BOB.identityKeyB64, CAROL.identityKeyB64]);
    crypto.removeMembers.mockResolvedValue({ commitB64: 'c', epoch: 5 });

    await service.reconcileMembership('500');
    expect(crypto.removeMembers).not.toHaveBeenCalled();

    await service.reconcileMembership('500', 1);
    expect(crypto.removeMembers).toHaveBeenCalledTimes(1);
  });

  it('removes stale devices before encrypting so the removed device is never a recipient', async () => {
    const { service, gateway, crypto } = setup();
    crypto.memberKeys.mockResolvedValue([LOW_SELF.identityKeyB64, BOB.identityKeyB64, CAROL.identityKeyB64]);
    crypto.removeMembers.mockResolvedValue({ commitB64: 'c', epoch: 9 });
    crypto.encrypt.mockResolvedValue({ ciphertextB64: 'ct', epoch: 9 });

    await service.send(dm(), { content: 'after the removal' });

    expect(crypto.removeMembers.mock.invocationCallOrder[0]).toBeLessThan(crypto.encrypt.mock.invocationCallOrder[0]!);
    const application = envelopes(gateway).find((e) => e.content_type === 'application');
    expect(application?.recipients.map((r) => r.device_id)).toEqual(['20']);
  });

  it('marks the group as lost when an applied commit removed this device', async () => {
    const { service, gateway, crypto } = setup();
    crypto.processIncoming.mockResolvedValue({ kind: 'commit', epoch: 8 } as never);
    crypto.memberKeys.mockResolvedValue([BOB.identityKeyB64]);

    await service.handleEnvelope(incomingCommit(LOW_SELF));

    expect(usePrivacyStore.getState().groups['500']?.state).toBe('error');
    expect(gateway.ofOp(GatewayOp.E2EE_ACK)).toHaveLength(1);
  });

  it('drops a commit that lost the epoch race and retries the pending removal as the next committer', async () => {
    const { service, gateway, crypto } = setup(HIGH_SELF);
    crypto.processIncoming.mockRejectedValue(new Error('ValidationError(WrongEpoch)'));
    crypto.memberKeys.mockResolvedValue([HIGH_SELF.identityKeyB64, BOB.identityKeyB64, CAROL.identityKeyB64]);
    crypto.removeMembers.mockResolvedValue({ commitB64: 'c', epoch: 6 });

    await service.handleEnvelope(incomingCommit(HIGH_SELF, '2'));

    expect(gateway.ofOp(GatewayOp.E2EE_ACK)).toHaveLength(1);
    expect(crypto.removeMembers).toHaveBeenCalledWith('500', [CAROL.identityKeyB64]);
  });
});

describe('mayCommit', () => {
  it('elects the lowest identity key and widens with each attempt', () => {
    const keys = ['c', 'a', 'b'];
    expect(mayCommit(keys, 'a', 0, false)).toBe(true);
    expect(mayCommit(keys, 'b', 0, false)).toBe(false);
    expect(mayCommit(keys, 'b', 1, false)).toBe(true);
    expect(mayCommit(keys, 'c', 0, true)).toBe(true);
  });
});

describe('gateway-driven removal', () => {
  it('reconciles on GUILD_MEMBER_REMOVE, GUILD_BAN_ADD and CHANNEL_RECIPIENT_REMOVE but not for our own removal', () => {
    const calls: (string | undefined)[] = [];
    const messaging = Object.create(PrivateMessaging.prototype) as PrivateMessaging;
    Object.assign(messaging, {
      deps: { getSelf: () => LOW_SELF },
      ephemeral: {
        reconcileAll: async (guildId?: string) => void calls.push(guildId),
        reconcileMembership: async (channelId: string) => void calls.push(channelId),
      },
    });
    messaging.handleDispatch('GUILD_MEMBER_REMOVE', { guild_id: 'g1', user: { id: '2' } });
    messaging.handleDispatch('GUILD_BAN_ADD', { guild_id: 'g2', user: { id: '2' } });
    messaging.handleDispatch('CHANNEL_RECIPIENT_REMOVE', { channel_id: '500', user: { id: '2' } });
    messaging.handleDispatch('USER_DEVICES_UPDATE', { user_id: '2' });
    messaging.handleDispatch('GUILD_MEMBER_REMOVE', { guild_id: 'g3', user: { id: LOW_SELF.userId } });
    expect(calls).toEqual(['g1', 'g2', '500', undefined]);
  });
});
