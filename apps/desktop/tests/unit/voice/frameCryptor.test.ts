import { describe, expect, it, vi } from 'vitest';
import { FrameCryptor, type WorkerLike } from '@renderer/infrastructure/voice/frameCryptor';

const worker = (): WorkerLike => ({ postMessage: vi.fn(), terminate: vi.fn() });

function legacyEndpoint() {
  const pipeTo = vi.fn(async () => undefined);
  const writable = {} as WritableStream;
  return { pipeTo, writable, endpoint: { createEncodedStreams: vi.fn(() => ({ readable: { pipeTo } as unknown as ReadableStream, writable })) } };
}

describe('FrameCryptor.bypass', () => {
  it('pipes encoded streams straight through on the legacy fallback', () => {
    const { endpoint, pipeTo, writable } = legacyEndpoint();
    new FrameCryptor(worker, undefined, true).bypass(endpoint as unknown as RTCRtpSender);
    expect(endpoint.createEncodedStreams).toHaveBeenCalledOnce();
    expect(pipeTo).toHaveBeenCalledWith(writable);
  });

  it('does nothing when RTCRtpScriptTransform is available', () => {
    const { endpoint } = legacyEndpoint();
    const ScriptTransform = vi.fn();
    new FrameCryptor(worker, ScriptTransform as never, true).bypass(endpoint as unknown as RTCRtpSender);
    expect(endpoint.createEncodedStreams).not.toHaveBeenCalled();
    expect(ScriptTransform).not.toHaveBeenCalled();
  });
});

describe('FrameCryptor keys', () => {
  const material = async () => new Uint8Array(32).fill(1);

  it('installs the epoch key for every attached sender and receiver, by user and key index', async () => {
    const w = worker();
    const cryptor = new FrameCryptor(() => w, vi.fn() as never, false);
    await cryptor.attachSender({} as RTCRtpSender, 'audio', 'opus', 'me');
    await cryptor.attachReceiver({} as RTCRtpReceiver, 'audio', 'opus', 'peer');
    await cryptor.setEpoch(7, material);
    const keys = (w.postMessage as ReturnType<typeof vi.fn>).mock.calls.map(([m]) => m).filter((m) => m.type === 'key');
    expect(keys.map((m) => [m.userId, m.keyIndex])).toEqual([['me', 7], ['peer', 7]]);
  });

  it('gives a sender that attaches after the epoch the current key, and activates sending by generation', async () => {
    const w = worker();
    const cryptor = new FrameCryptor(() => w, vi.fn() as never, false);
    await cryptor.setEpoch(3, material);
    await cryptor.attachReceiver({} as RTCRtpReceiver, 'audio', 'opus', 'late');
    await cryptor.activate(3);
    const messages = (w.postMessage as ReturnType<typeof vi.fn>).mock.calls.map(([m]) => m);
    expect(messages.map((m) => m.type)).toEqual(['key', 'activate']);
    expect(messages[1]).toEqual({ type: 'activate', generation: 3 });
  });

  it('rejects an attach when the runtime has no transform API, so the call is refused rather than sent clear', async () => {
    const cryptor = new FrameCryptor(worker, undefined, false);
    expect(cryptor.supported).toBe(false);
    await expect(cryptor.attachSender({} as RTCRtpSender, 'audio', 'opus', 'me')).rejects.toThrow(/not supported/);
  });

  it('forgets keys on clear', async () => {
    const w = worker();
    const cryptor = new FrameCryptor(() => w, vi.fn() as never, false);
    await cryptor.attachSender({} as RTCRtpSender, 'audio', 'opus', 'me');
    await cryptor.setEpoch(1, material);
    cryptor.clear();
    await cryptor.attachReceiver({} as RTCRtpReceiver, 'audio', 'opus', 'u');
    const types = (w.postMessage as ReturnType<typeof vi.fn>).mock.calls.map(([m]) => m.type);
    expect(types).toEqual(['key', 'clear']);
  });
});
