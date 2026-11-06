import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrivateMessaging } from '../../../src/application/privacy/privateMessaging';
import { FakeGateway, asApi, dm, fakeApi, fakeCrypto, resetStores } from './fakes';

const SELF = { userId: '1', deviceId: '10', identityKeyB64: 'key-self' };

function setup() {
  resetStores();
  const gateway = new FakeGateway();
  const { crypto } = fakeCrypto(gateway);
  const api = fakeApi({});
  const messaging = new PrivateMessaging({
    gateway,
    api: asApi(api),
    crypto,
    getSelf: () => SELF,
    fetchBytes: async () => new Uint8Array(),
    createPeerConnection: () => {
      throw new Error('not used');
    },
  } as unknown as ConstructorParameters<typeof PrivateMessaging>[0]);
  return { messaging, crypto };
}

describe('the encrypted store before it is open', () => {
  beforeEach(() => resetStores());

  it('is not read while the store is closed, for example when the native module is missing', async () => {
    const { messaging, crypto } = setup();

    await messaging.sender.loadHistory(dm());

    expect(crypto.listMessages).not.toHaveBeenCalled();
  });

  it('is read once the store has opened', async () => {
    const { messaging, crypto } = setup();

    await messaging.initialiseIdentity();
    await messaging.sender.loadHistory(dm());

    expect(crypto.listMessages).toHaveBeenCalled();
  });

  it('stays closed when opening fails', async () => {
    const { messaging, crypto } = setup();
    vi.mocked(crypto.initialise).mockRejectedValueOnce(new Error('wrong key'));

    await expect(messaging.initialiseIdentity()).rejects.toThrow('wrong key');
    await messaging.sender.loadHistory(dm());

    expect(crypto.listMessages).not.toHaveBeenCalled();
  });
});
