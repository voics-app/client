import type * as NativeCallKitModule from '../../../src/voice/callkit/nativeCallKit';
import { createNativeCallKit, parseCallKitEvent, type VoicsCallKitModule } from '../../../src/voice/callkit/nativeCallKit';

function fakeModule() {
  let listener: ((event: unknown) => void) | undefined;
  const remove = jest.fn();
  const module: VoicsCallKitModule = {
    addListener: jest.fn((_name, l) => {
      listener = l;
      return { remove };
    }),
    voipToken: jest.fn(async () => 'ab12'),
    reportIncoming: jest.fn(async () => true),
    startOutgoing: jest.fn(async () => true),
    reportConnected: jest.fn(async () => undefined),
    endCall: jest.fn(async () => undefined),
    setMuted: jest.fn(async () => undefined),
  };
  return { module, emit: (event: unknown) => listener?.(event), remove };
}

describe('parseCallKitEvent', () => {
  it.each([
    [{ type: 'token', token: 'ab12' }, { type: 'token', token: 'ab12' }],
    [{ type: 'token', token: null }, { type: 'token', token: null }],
    [{ type: 'token', token: '' }, { type: 'token', token: null }],
    [{ type: 'incoming', channelId: '10', private: false }, { type: 'incoming', channelId: '10', private: false }],
    [{ type: 'incoming', channelId: '10' }, { type: 'incoming', channelId: '10', private: true }],
    [{ type: 'answer', channelId: '10' }, { type: 'answer', channelId: '10' }],
    [{ type: 'end', channelId: '10', reason: 'decline' }, { type: 'end', channelId: '10', reason: 'decline' }],
    [{ type: 'mute', channelId: '10', muted: true }, { type: 'mute', channelId: '10', muted: true }],
    [{ type: 'audio', active: false }, { type: 'audio', active: false }],
  ])('reads %j', (raw, event) => {
    expect(parseCallKitEvent(raw)).toEqual(event);
  });

  it.each([
    null,
    'answer',
    42,
    {},
    { type: 'answer' },
    { type: 'answer', channelId: '' },
    { type: 'end', channelId: '10', reason: 'exploded' },
    { type: 'mute', channelId: '10', muted: 'yes' },
    { type: 'audio', active: 1 },
    { type: 'something-new', channelId: '10' },
  ])('drops %j instead of trusting it', (raw) => {
    expect(parseCallKitEvent(raw)).toBeNull();
  });
});

describe('createNativeCallKit', () => {
  it('turns native events into typed ones and drops the rest, and unsubscribes', () => {
    const { module, emit, remove } = fakeModule();
    const seen: unknown[] = [];
    const stop = createNativeCallKit(module).onEvent((event) => seen.push(event));
    emit({ type: 'answer', channelId: '10' });
    emit({ type: 'nonsense' });
    expect(seen).toEqual([{ type: 'answer', channelId: '10' }]);
    stop();
    expect(remove).toHaveBeenCalled();
  });

  it('passes calls to the module with plain arguments', async () => {
    const { module } = fakeModule();
    const native = createNativeCallKit(module);
    expect(await native.voipToken()).toBe('ab12');
    await native.reportIncoming({ channelId: '10', callerName: 'Pat', isPrivate: false, ringSeconds: 30 });
    expect(module.reportIncoming).toHaveBeenCalledWith('10', 'Pat', false, 30);
    await native.startOutgoing('10', null);
    expect(module.startOutgoing).toHaveBeenCalledWith('10', null);
    await native.reportConnected('10');
    await native.endCall('10', 'local');
    expect(module.endCall).toHaveBeenCalledWith('10', 'local');
    await native.setMuted('10', true);
    expect(module.setMuted).toHaveBeenCalledWith('10', true);
  });
});

describe('loadNativeCallKit', () => {
  afterEach(() => jest.resetModules());

  function load(options: { native: boolean; os: string; module: unknown | 'throws' }) {
    jest.resetModules();
    jest.doMock('../../../src/native/isNativeBuild', () => ({ isNativeBuild: options.native }));
    jest.doMock('react-native', () => ({ Platform: { OS: options.os } }));
    jest.doMock('expo', () => ({
      requireOptionalNativeModule: () => {
        if (options.module === 'throws') throw new Error('no native module');
        return options.module;
      },
    }));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return (require('../../../src/voice/callkit/nativeCallKit') as typeof NativeCallKitModule).loadNativeCallKit();
  }

  it('is null in Expo Go, on other platforms, without the module, and when loading fails', () => {
    const module = fakeModule().module;
    expect(load({ native: false, os: 'ios', module })).toBeNull();
    expect(load({ native: false, os: 'android', module })).toBeNull();
    expect(load({ native: true, os: 'web', module })).toBeNull();
    expect(load({ native: true, os: 'ios', module: null })).toBeNull();
    expect(load({ native: true, os: 'ios', module: 'throws' })).toBeNull();
  });

  it('is the module in an iOS native build', () => {
    expect(load({ native: true, os: 'ios', module: fakeModule().module })).not.toBeNull();
  });

  it('is the module in an Android native build, with no PushKit token', async () => {
    const { module } = fakeModule();
    (module.voipToken as jest.Mock).mockResolvedValue(null);
    const native = load({ native: true, os: 'android', module });
    expect(native).not.toBeNull();
    expect(await native?.voipToken()).toBeNull();
  });
});
