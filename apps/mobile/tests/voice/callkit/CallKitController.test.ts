import { CallKitController, type CallKitDeps } from '../../../src/voice/callkit/CallKitController';
import { ANSWER_JOIN_MS, GATEWAY_SETTLE_MS, type CallSnapshot } from '../../../src/voice/callkit/callKitModel';
import type { CallKitEvent, NativeCallKit } from '../../../src/voice/callkit/nativeCallKit';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function rig(options: { reported?: boolean; started?: boolean } = {}) {
  let listener: ((event: CallKitEvent) => void) | undefined;
  const native = {
    onEvent: jest.fn((l: (event: CallKitEvent) => void) => {
      listener = l;
      return () => {
        listener = undefined;
      };
    }),
    voipToken: jest.fn(async () => 'aa11'),
    reportIncoming: jest.fn(async () => options.reported ?? true),
    startOutgoing: jest.fn(async () => options.started ?? true),
    reportConnected: jest.fn(async () => undefined),
    endCall: jest.fn(async () => undefined),
    setMuted: jest.fn(async () => undefined),
  } satisfies NativeCallKit;
  let now = 1_000_000;
  let muted = false;
  const deps = {
    native,
    api: { registerVoipToken: jest.fn(async () => undefined), removeVoipToken: jest.fn(async () => undefined) },
    environment: 'sandbox' as const,
    now: () => now,
    whenReady: jest.fn<Promise<void>, []>(async () => undefined),
    accept: jest.fn(),
    decline: jest.fn(),
    hangUp: jest.fn(),
    isMuted: () => muted,
    setMuted: jest.fn((value: boolean) => {
      muted = value;
    }),
    audioSession: jest.fn(),
    setShown: jest.fn(),
  } satisfies CallKitDeps;
  const controller = new CallKitController(deps);
  controller.attach();
  return {
    controller,
    native,
    deps,
    emit: (event: CallKitEvent) => listener?.(event),
    advance: (ms: number) => void (now += ms),
    now: () => now,
    setMuted: (value: boolean) => void (muted = value),
  };
}

const snapshot = (over: Partial<CallSnapshot> = {}): CallSnapshot => ({ signedIn: true, gatewayReadyAt: null, ringing: [], active: null, selfMute: false, ...over });
const ringing = (channelId = '10', callerName: string | null = 'Pat', isPrivate = false) => ({ channelId, callerName, isPrivate });
const lastShown = (deps: { setShown: jest.Mock }) => deps.setShown.mock.calls.at(-1)?.[0];

describe('CallKitController without CallKit (Expo Go)', () => {
  it('does nothing at all', async () => {
    const controller = new CallKitController({ ...rig().deps, native: null });
    controller.attach();
    await controller.signedInStart();
    controller.update(snapshot({ ringing: [ringing()] }));
    controller.signedOut();
    controller.detach();
  });
});

describe('the VoIP token', () => {
  it('is registered with the api when the session is ready, with the APNs host of this build', async () => {
    const { controller, deps } = rig();
    await controller.signedInStart();
    expect(deps.api.registerVoipToken).toHaveBeenCalledWith({ token: 'aa11', environment: 'sandbox' });
  });

  it('is registered again when the system rotates it, but only while signed in', async () => {
    const { controller, deps, emit } = rig();
    emit({ type: 'token', token: 'early' });
    expect(deps.api.registerVoipToken).not.toHaveBeenCalled();
    await controller.signedInStart();
    expect(deps.api.registerVoipToken).toHaveBeenLastCalledWith({ token: 'early', environment: 'sandbox' });
    emit({ type: 'token', token: 'bb22' });
    expect(deps.api.registerVoipToken).toHaveBeenLastCalledWith({ token: 'bb22', environment: 'sandbox' });
  });

  it('is not registered when the system has none yet, and is removed when the system takes it back', async () => {
    const { controller, deps, native, emit } = rig();
    native.voipToken.mockResolvedValueOnce(null as never);
    await controller.signedInStart();
    expect(deps.api.registerVoipToken).not.toHaveBeenCalled();
    expect(deps.api.removeVoipToken).not.toHaveBeenCalled();
    emit({ type: 'token', token: null });
    expect(deps.api.removeVoipToken).toHaveBeenCalledTimes(1);
  });

  it('survives an api that is down: the next start registers again', async () => {
    const { controller, deps } = rig();
    deps.api.registerVoipToken.mockRejectedValueOnce(new Error('offline'));
    await expect(controller.signedInStart()).resolves.toBeUndefined();
  });
});

describe('a call that rings while the app is open', () => {
  it('is shown in the system call UI, once, with the caller for a standard conversation', async () => {
    const { controller, native, deps } = rig();
    await controller.signedInStart();
    controller.update(snapshot({ ringing: [ringing()] }));
    controller.update(snapshot({ ringing: [ringing()] }));
    expect(native.reportIncoming).toHaveBeenCalledTimes(1);
    expect(native.reportIncoming).toHaveBeenCalledWith({ channelId: '10', callerName: 'Pat', isPrivate: false, ringSeconds: 30 });
    expect(lastShown(deps)).toEqual(['10']);
  });

  it('is passed on as private, without a name, for an encrypted conversation', async () => {
    const { controller, native } = rig();
    await controller.signedInStart();
    controller.update(snapshot({ ringing: [ringing('11', null, true)] }));
    expect(native.reportIncoming).toHaveBeenCalledWith({ channelId: '11', callerName: null, isPrivate: true, ringSeconds: 30 });
  });

  it('is left to the app card when the system refuses it (Do Not Disturb)', async () => {
    const { controller, deps } = rig({ reported: false });
    await controller.signedInStart();
    controller.update(snapshot({ ringing: [ringing()] }));
    await flush();
    expect(lastShown(deps)).toEqual([]);
  });

  it('is shown nothing for before sign-in, and for a call the person is already in', async () => {
    const { controller, native } = rig();
    controller.update(snapshot({ ringing: [ringing()] }));
    await controller.signedInStart();
    controller.update(snapshot({ ringing: [ringing()], active: { channelId: '10', title: 'Pat', connected: false } }));
    expect(native.reportIncoming).not.toHaveBeenCalled();
  });
});

describe('a call reported by a VoIP push', () => {
  it('is known to the app once it has started, so the app card stays hidden and the gateway ring does not report it twice', async () => {
    const { controller, native, deps, emit } = rig();
    emit({ type: 'incoming', channelId: '10', private: false });
    expect(lastShown(deps)).toEqual(['10']);
    await controller.signedInStart();
    controller.update(snapshot({ ringing: [ringing()], gatewayReadyAt: 1 }));
    expect(native.reportIncoming).not.toHaveBeenCalled();
  });

  it('is not ended while the gateway has not told the app about it yet', async () => {
    const { controller, native, advance, now, emit } = rig();
    emit({ type: 'incoming', channelId: '10', private: false });
    await controller.signedInStart();
    controller.update(snapshot({ gatewayReadyAt: null }));
    controller.update(snapshot({ gatewayReadyAt: now() }));
    advance(GATEWAY_SETTLE_MS - 1);
    controller.update(snapshot({ gatewayReadyAt: now() - (GATEWAY_SETTLE_MS - 1) }));
    expect(native.endCall).not.toHaveBeenCalled();
  });

  it('is ended as unanswered once the gateway has settled and nobody rings for it, and not before that', async () => {
    const { controller, native, deps, advance, now, emit } = rig();
    emit({ type: 'incoming', channelId: '10', private: false });
    await controller.signedInStart();
    const readyAt = now();
    advance(GATEWAY_SETTLE_MS);
    controller.update(snapshot({ gatewayReadyAt: readyAt }));
    expect(native.endCall).toHaveBeenCalledWith('10', 'unanswered');
    expect(lastShown(deps)).toEqual([]);
  });

  it('stays while the gateway still rings for it', async () => {
    const { controller, native, advance, now, emit } = rig();
    emit({ type: 'incoming', channelId: '10', private: false });
    await controller.signedInStart();
    const readyAt = now();
    advance(GATEWAY_SETTLE_MS * 3);
    controller.update(snapshot({ gatewayReadyAt: readyAt, ringing: [ringing()] }));
    expect(native.endCall).not.toHaveBeenCalled();
  });
});

describe('answering in the system UI', () => {
  it('joins the call once the app is ready, and ends the system call when the app call is over', async () => {
    const { controller, native, deps, emit } = rig();
    await controller.signedInStart();
    emit({ type: 'answer', channelId: '10' });
    await flush();
    expect(deps.whenReady).toHaveBeenCalled();
    expect(deps.accept).toHaveBeenCalledWith('10');

    controller.update(snapshot({ active: { channelId: '10', title: 'Pat', connected: false } }));
    expect(native.startOutgoing).not.toHaveBeenCalled();
    controller.update(snapshot({ active: { channelId: '10', title: 'Pat', connected: true } }));
    expect(native.reportConnected).not.toHaveBeenCalled();
    expect(native.endCall).not.toHaveBeenCalled();

    controller.update(snapshot());
    expect(native.endCall).toHaveBeenCalledWith('10', 'local');
  });

  it('waits for the app to start: an answer given on the lock screen of a closed app joins after sign-in', async () => {
    const { controller, deps, emit } = rig();
    let release: () => void = () => undefined;
    deps.whenReady.mockImplementation(() => new Promise<void>((resolve) => (release = resolve)));
    emit({ type: 'answer', channelId: '10' });
    await flush();
    expect(deps.accept).not.toHaveBeenCalled();
    await controller.signedInStart();
    release();
    await flush();
    expect(deps.accept).toHaveBeenCalledWith('10');
  });

  it('does not end a call that has been answered but whose join has not begun', async () => {
    const { controller, native, advance, emit } = rig();
    await controller.signedInStart();
    emit({ type: 'answer', channelId: '10' });
    advance(ANSWER_JOIN_MS - 1);
    controller.update(snapshot({ gatewayReadyAt: 1 }));
    expect(native.endCall).not.toHaveBeenCalled();
  });

  it('gives up on an answer that never became a call', async () => {
    const { controller, native, advance, emit } = rig();
    await controller.signedInStart();
    emit({ type: 'answer', channelId: '10' });
    advance(ANSWER_JOIN_MS + 1);
    controller.update(snapshot());
    expect(native.endCall).toHaveBeenCalledWith('10', 'failed');
  });
});

describe('ending in the system UI', () => {
  it('declining a ringing call tells the gateway', async () => {
    const { controller, deps, emit } = rig();
    await controller.signedInStart();
    emit({ type: 'incoming', channelId: '10', private: false });
    emit({ type: 'end', channelId: '10', reason: 'decline' });
    await flush();
    expect(deps.decline).toHaveBeenCalledWith('10');
    expect(deps.hangUp).not.toHaveBeenCalled();
    expect(lastShown(deps)).toEqual([]);
  });

  it('hanging up an answered call leaves the call', async () => {
    const { controller, deps, emit } = rig();
    await controller.signedInStart();
    emit({ type: 'answer', channelId: '10' });
    emit({ type: 'end', channelId: '10', reason: 'hangup' });
    expect(deps.hangUp).toHaveBeenCalledTimes(1);
    expect(deps.decline).not.toHaveBeenCalled();
  });

  it('hanging up a call the person started leaves it', async () => {
    const { controller, deps, emit } = rig();
    await controller.signedInStart();
    controller.update(snapshot({ active: { channelId: '10', title: 'Pat', connected: true } }));
    emit({ type: 'end', channelId: '10', reason: 'hangup' });
    expect(deps.hangUp).toHaveBeenCalledTimes(1);
  });

  it('a ring that timed out natively only clears it, without declining', async () => {
    const { controller, deps, emit } = rig();
    await controller.signedInStart();
    emit({ type: 'incoming', channelId: '10', private: false });
    emit({ type: 'end', channelId: '10', reason: 'timeout' });
    await flush();
    expect(deps.decline).not.toHaveBeenCalled();
    expect(deps.hangUp).not.toHaveBeenCalled();
    expect(lastShown(deps)).toEqual([]);
  });

  it('a reset of the system leaves a call the app is in', async () => {
    const { controller, deps, emit } = rig();
    await controller.signedInStart();
    emit({ type: 'answer', channelId: '10' });
    emit({ type: 'end', channelId: '10', reason: 'reset' });
    expect(deps.hangUp).toHaveBeenCalledTimes(1);
  });
});

describe('a call the person starts or joins from the app', () => {
  it('appears in the system call UI with the conversation name, and is connected when the call is', async () => {
    const { controller, native } = rig();
    await controller.signedInStart();
    controller.update(snapshot({ active: { channelId: '10', title: 'Pat', connected: false } }));
    expect(native.startOutgoing).toHaveBeenCalledWith('10', 'Pat');
    expect(native.reportConnected).not.toHaveBeenCalled();
    controller.update(snapshot({ active: { channelId: '10', title: 'Pat', connected: true } }));
    controller.update(snapshot({ active: { channelId: '10', title: 'Pat', connected: true } }));
    expect(native.startOutgoing).toHaveBeenCalledTimes(1);
    expect(native.reportConnected).toHaveBeenCalledTimes(1);
  });

  it('has no name in an encrypted conversation', async () => {
    const { controller, native } = rig();
    await controller.signedInStart();
    controller.update(snapshot({ active: { channelId: '10', title: '', connected: false } }));
    expect(native.startOutgoing).toHaveBeenCalledWith('10', null);
  });

  it('ends in the system UI when the person leaves, as a normal end', async () => {
    const { controller, native, deps } = rig();
    await controller.signedInStart();
    controller.update(snapshot({ active: { channelId: '10', title: 'Pat', connected: true } }));
    controller.update(snapshot());
    expect(native.endCall).toHaveBeenCalledWith('10', 'local');
    expect(lastShown(deps)).toEqual([]);
  });

  it('is not left in the system UI when the system refused to start it', async () => {
    const { controller, native, deps } = rig({ started: false });
    await controller.signedInStart();
    controller.update(snapshot({ active: { channelId: '10', title: 'Pat', connected: false } }));
    await flush();
    expect(lastShown(deps)).toEqual([]);
    expect(native.endCall).not.toHaveBeenCalled();
  });
});

describe('mute', () => {
  it('follows the system UI: muting there mutes the app, and the app does not echo it back', async () => {
    const { controller, native, deps, emit, setMuted } = rig();
    await controller.signedInStart();
    controller.update(snapshot({ active: { channelId: '10', title: 'Pat', connected: true } }));
    emit({ type: 'mute', channelId: '10', muted: true });
    expect(deps.setMuted).toHaveBeenCalledWith(true);
    setMuted(true);
    controller.update(snapshot({ active: { channelId: '10', title: 'Pat', connected: true }, selfMute: true }));
    expect(native.setMuted).not.toHaveBeenCalled();
  });

  it('is not changed when the system UI says what the app already is', async () => {
    const { controller, deps, emit } = rig();
    await controller.signedInStart();
    emit({ type: 'mute', channelId: '10', muted: false });
    expect(deps.setMuted).not.toHaveBeenCalled();
  });

  it('follows the app: muting in the app mutes the system call UI', async () => {
    const { controller, native } = rig();
    await controller.signedInStart();
    controller.update(snapshot({ active: { channelId: '10', title: 'Pat', connected: true } }));
    expect(native.setMuted).not.toHaveBeenCalled();
    controller.update(snapshot({ active: { channelId: '10', title: 'Pat', connected: true }, selfMute: true }));
    expect(native.setMuted).toHaveBeenLastCalledWith('10', true);
    controller.update(snapshot({ active: { channelId: '10', title: 'Pat', connected: true }, selfMute: false }));
    expect(native.setMuted).toHaveBeenLastCalledWith('10', false);
  });

  it('is told to the system UI when the call starts muted', async () => {
    const { controller, native } = rig();
    await controller.signedInStart();
    controller.update(snapshot({ active: { channelId: '10', title: 'Pat', connected: false }, selfMute: true }));
    expect(native.setMuted).toHaveBeenCalledWith('10', true);
  });
});

describe('audio and sign-out', () => {
  it('hands the audio session to WebRTC when the system activates it, and takes it back', async () => {
    const { deps, emit } = rig();
    emit({ type: 'audio', active: true });
    emit({ type: 'audio', active: false });
    expect(deps.audioSession.mock.calls).toEqual([[true], [false]]);
  });

  it('ends every system call at sign-out', async () => {
    const { controller, native, deps } = rig();
    await controller.signedInStart();
    controller.update(snapshot({ ringing: [ringing('10')] }));
    controller.update(snapshot({ ringing: [ringing('10')], active: { channelId: '11', title: 'Sam', connected: true } }));
    controller.signedOut();
    expect(native.endCall).toHaveBeenCalledWith('10', 'local');
    expect(native.endCall).toHaveBeenCalledWith('11', 'local');
    expect(lastShown(deps)).toEqual([]);
  });

  it('stops listening when detached', () => {
    const { controller, emit, deps } = rig();
    controller.detach();
    emit({ type: 'audio', active: true });
    expect(deps.audioSession).not.toHaveBeenCalled();
  });
});
