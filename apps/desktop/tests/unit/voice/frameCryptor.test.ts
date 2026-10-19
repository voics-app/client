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
