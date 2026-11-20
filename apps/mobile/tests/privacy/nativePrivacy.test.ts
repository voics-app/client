/* eslint-disable @typescript-eslint/no-require-imports -- each case loads the module fresh, under its own mocks */
import type * as NativePrivacyModule from '../../src/privacy/nativePrivacy';
import { createNativePrivacy, PEER_UNAVAILABLE } from '../../src/privacy/nativePrivacy';
import { createMobileCryptoBridge, type VoicsCryptoNative } from '../../src/privacy/cryptoBridge';
import { createReactNativePeerConnection } from '../../src/privacy/reactNativePeerConnection';

function fakeNative(): jest.Mocked<VoicsCryptoNative> {
  const native = {
    initialise: jest.fn(async () => 'identity-b64'),
    sign: jest.fn(async () => 'sig'),
    verify: jest.fn(async () => true),
    generateKeyPackages: jest.fn(async () => ['kp']),
    hasGroup: jest.fn(async () => true),
    deleteGroup: jest.fn(async () => true),
    createGroup: jest.fn(async () => 0),
    addMembers: jest.fn(async () => ({ commitB64: 'c', welcomeB64: 'w', epoch: 1 })),
    memberKeys: jest.fn(async () => ['k1']),
    removeMembers: jest.fn(async () => null),
    joinFromWelcome: jest.fn(async () => ({ groupId: 'g', epoch: 1 })),
    encrypt: jest.fn(async () => ({ ciphertextB64: 'ct', epoch: 1 })),
    processIncoming: jest.fn(async () => ({ kind: 'ignored' as const })),
    exportSecret: jest.fn(async () => 'secret'),
    putMessage: jest.fn(async () => undefined),
    listMessages: jest.fn(async () => []),
    deleteMessage: jest.fn(async () => undefined),
  };
  return native as unknown as jest.Mocked<VoicsCryptoNative>;
}

describe('createMobileCryptoBridge', () => {
  it('reports itself available and forwards the calls untouched', async () => {
    const native = fakeNative();
    const bridge = createMobileCryptoBridge(native);
    expect(await bridge.status()).toEqual({ available: true });
    expect(await bridge.initialise('42', 'Voics iOS')).toBe('identity-b64');
    expect(native.initialise).toHaveBeenCalledWith('42', 'Voics iOS');
    await bridge.encrypt('chan', 'cGxhaW4=');
    expect(native.encrypt).toHaveBeenCalledWith('chan', 'cGxhaW4=');
    await bridge.verify('pk', 'data', 'sig');
    expect(native.verify).toHaveBeenCalledWith('pk', 'data', 'sig');
    await bridge.removeMembers('chan', ['k1']);
    expect(native.removeMembers).toHaveBeenCalledWith('chan', ['k1']);
  });

  it('spreads a stored message record into the native arguments and passes the page cursor on', async () => {
    const native = fakeNative();
    const bridge = createMobileCryptoBridge(native);
    await bridge.putMessage({ channelId: 'c', messageId: 'm', sortKey: 5, json: '{}' });
    expect(native.putMessage).toHaveBeenCalledWith('c', 'm', 5, '{}');
    await bridge.listMessages('c', null, 50);
    expect(native.listMessages).toHaveBeenCalledWith('c', null, 50);
    await bridge.deleteMessage('c', 'm');
    expect(native.deleteMessage).toHaveBeenCalledWith('c', 'm');
  });

  it('lets a native failure through as the rejection, so the services can show it', async () => {
    const native = fakeNative();
    native.encrypt.mockRejectedValueOnce(new Error('unknown MLS group chan'));
    await expect(createMobileCryptoBridge(native).encrypt('chan', 'x')).rejects.toThrow('unknown MLS group chan');
  });
});

describe('createReactNativePeerConnection', () => {
  it('opens a connection with the given ice servers', () => {
    const created: object[] = [];
    const factory = createReactNativePeerConnection({
      RTCPeerConnection: class {
        constructor(config: object) {
          created.push(config);
        }
      },
    });
    factory({ iceServers: [{ urls: 'turn:t.test', username: 'u', credential: 'c' }] });
    expect(created).toEqual([{ iceServers: [{ urls: 'turn:t.test', username: 'u', credential: 'c' }] }]);
  });
});

describe('createNativePrivacy', () => {
  it('fails peer-to-peer with a plain message when the calling module is missing, and keeps the crypto', async () => {
    const privacy = createNativePrivacy(fakeNative(), null);
    expect(() => privacy.createPeerConnection({ iceServers: [] })).toThrow(PEER_UNAVAILABLE);
    expect(await privacy.crypto.status()).toEqual({ available: true });
  });

  it('requires the complete native file adapter and refuses unauthenticated audio', async () => {
    const native = fakeNative();
    expect(createNativePrivacy(native, null).attachmentPlatform).toBeUndefined();
    Object.assign(native, {
      readAttachment: jest.fn(async () => 'AQID'),
      encryptAttachment: jest.fn(async () => ({ ciphertext: 'BAUG', key_b64: 'key', nonce_b64: 'nonce', sha256_b64: 'hash' })),
      decryptAttachment: jest.fn(async () => { throw new Error('bad tag'); }),
      uploadAttachment: jest.fn(async () => undefined),
      downloadAttachment: jest.fn(async () => 'BAUG'),
      storeAttachment: jest.fn(async () => 'file:///private.ogg'),
      removeAttachment: jest.fn(async () => undefined),
    });
    const platform = createNativePrivacy(native, null).attachmentPlatform!;
    expect([...await platform.read({ uri: 'file:///voice.ogg' } as unknown as File)]).toEqual([1, 2, 3]);
    const encrypted = await platform.encrypt(new Uint8Array([1, 2, 3]));
    expect([...encrypted.ciphertext]).toEqual([4, 5, 6]);
    await expect(platform.decrypt(encrypted.ciphertext, { key_b64: 'key', nonce_b64: 'nonce', sha256_b64: 'hash', size: 3 })).rejects.toMatchObject({ reason: 'integrity' });
    await expect(platform.store('1:0', new Uint8Array([1]), 'text/plain')).rejects.toThrow('Only voice recordings');
    expect(native.storeAttachment).not.toHaveBeenCalled();
  });
});

describe('loadNativePrivacy', () => {
  afterEach(() => jest.resetModules());

  function load(executionEnvironment: string, setup: () => void): NativePrivacyModule.NativePrivacy | null {
    jest.resetModules();
    jest.doMock('expo-constants', () => ({ __esModule: true, default: { executionEnvironment }, ExecutionEnvironment: { StoreClient: 'storeClient' } }));
    setup();
    return (require('../../src/privacy/nativePrivacy') as typeof NativePrivacyModule).loadNativePrivacy();
  }

  it('returns null in Expo Go without touching either native module', () => {
    const touched = jest.fn(() => {
      throw new Error('native module touched');
    });
    const result = load('storeClient', () => {
      jest.doMock('expo', touched);
      jest.doMock('@livekit/react-native-webrtc', touched);
    });
    expect(result).toBeNull();
    expect(touched).not.toHaveBeenCalled();
  });

  it('builds the stack in a development build when the crypto module is linked', () => {
    const result = load('bare', () => {
      jest.doMock('expo', () => ({ requireOptionalNativeModule: () => fakeNative() }));
      jest.doMock('@livekit/react-native-webrtc', () => ({ RTCPeerConnection: class {} }));
    });
    expect(result).not.toBeNull();
  });

  it('returns null, rather than crashing, when the build does not contain the crypto module', () => {
    expect(
      load('bare', () => {
        jest.doMock('expo', () => ({ requireOptionalNativeModule: () => null }));
      }),
    ).toBeNull();
  });

  it('fails closed when the Android crypto package is absent', () => {
    expect(load('bare', () => {
      jest.doMock('expo', () => ({ requireOptionalNativeModule: () => ({ isAvailable: () => false }) }));
    })).toBeNull();
  });

  it('still offers encrypted chats when only the calling module is missing', () => {
    const result = load('bare', () => {
      jest.doMock('expo', () => ({ requireOptionalNativeModule: () => fakeNative() }));
      jest.doMock('@livekit/react-native-webrtc', () => {
        throw new Error('Native module WebRTCModule not found');
      });
    });
    expect(result).not.toBeNull();
    expect(() => result?.createPeerConnection({ iceServers: [] })).toThrow(PEER_UNAVAILABLE);
  });
});
