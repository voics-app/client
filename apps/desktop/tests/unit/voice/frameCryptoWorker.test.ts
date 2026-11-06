import { beforeAll, describe, expect, it } from 'vitest';
import { decryptFrame, importFrameKey } from '@renderer/workers/frameCrypto';
import type { TransformOptions, WorkerMessage } from '@renderer/workers/frameCryptoWorker';

/** Drives the real worker module the way the browser does: messages in, an encoded-frame stream through its transform. */
interface Scope {
  onmessage: ((event: { data: WorkerMessage }) => void) | null;
  onrtctransform: ((event: { transformer: { readable: ReadableStream; writable: WritableStream; options: TransformOptions } }) => void) | null;
}
const scope = globalThis as unknown as Scope;

beforeAll(async () => {
  await import('@renderer/workers/frameCryptoWorker');
});

const material = new Uint8Array(32).map((_, i) => i + 1);
const hex = (value: string): Uint8Array => Uint8Array.from(value.match(/../g)!.map((byte) => parseInt(byte, 16)));
const REFERENCE_OPUS_SEALED = hex('03d7abec4de2699dd042a567eb91a560384691d8415cdf6d8870fdff567de1a7d1f17e85a0a1a2a3a4a5a6a7a8a9aaab0c05');

function run(options: TransformOptions, frames: Uint8Array[]): Promise<Uint8Array[]> {
  const source = new ReadableStream<{ data: ArrayBuffer }>({
    start(controller) {
      for (const frame of frames) controller.enqueue({ data: frame.slice().buffer as ArrayBuffer });
      controller.close();
    },
  });
  const out: Uint8Array[] = [];
  const sink = new WritableStream<{ data: ArrayBuffer }>({
    write(frame) {
      out.push(new Uint8Array(frame.data));
    },
  });
  scope.onrtctransform!({ transformer: { readable: source as ReadableStream, writable: sink as WritableStream, options } });
  return new Promise((resolve) => setTimeout(() => resolve(out), 30));
}

const send = (message: WorkerMessage) => scope.onmessage!({ data: message });

describe('frame crypto worker', () => {
  it('sends nothing before a key is active, then sends frames only the right key opens', async () => {
    send({ type: 'clear' });
    const clear = new Uint8Array(20).fill(5);
    const options: TransformOptions = { operation: 'encrypt', kind: 'audio', codec: 'opus', userId: 'me' };
    expect(await run(options, [clear])).toEqual([]);

    const key = await importFrameKey(material);
    send({ type: 'key', userId: 'me', keyIndex: 4, key });
    expect(await run(options, [clear])).toEqual([]);

    send({ type: 'activate', generation: 4 });
    const sealed = await run(options, [clear, clear]);
    expect(sealed).toHaveLength(2);
    expect(sealed[0]).not.toEqual(clear);
    expect(Array.from((await decryptFrame(key, 'audio', 'opus', sealed[0]!))!)).toEqual(Array.from(clear));
    expect(sealed[0]!.slice(-14, -2)).not.toEqual(sealed[1]!.slice(-14, -2));
  });

  it('drops frames without a valid trailer, with an unknown key index, or that fail authentication, and passes authentic ones', async () => {
    send({ type: 'clear' });
    const key = await importFrameKey(material);
    send({ type: 'key', userId: 'peer', keyIndex: 5, key });
    const options: TransformOptions = { operation: 'decrypt', kind: 'audio', codec: 'opus', userId: 'peer' };
    const tampered = REFERENCE_OPUS_SEALED.slice();
    tampered[8] = (tampered[8] ?? 0) ^ 1;
    const unknownIndex = REFERENCE_OPUS_SEALED.slice();
    unknownIndex[unknownIndex.length - 1] = 9;
    const clearFrame = new Uint8Array(60).fill(3);
    const out = await run(options, [clearFrame, tampered, unknownIndex, REFERENCE_OPUS_SEALED]);
    expect(out).toHaveLength(1);
    expect(Array.from(out[0]!)).toEqual(Array.from(hex('030a11181f262d343b424950575e656c737a8188')));
  });

  it('decrypts nothing for a sender whose key is not installed, and nothing after clear', async () => {
    send({ type: 'clear' });
    const options: TransformOptions = { operation: 'decrypt', kind: 'audio', codec: 'opus', userId: 'peer' };
    expect(await run(options, [REFERENCE_OPUS_SEALED])).toEqual([]);
    send({ type: 'key', userId: 'peer', keyIndex: 5, key: await importFrameKey(material) });
    expect(await run(options, [REFERENCE_OPUS_SEALED])).toHaveLength(1);
    send({ type: 'clear' });
    expect(await run(options, [REFERENCE_OPUS_SEALED])).toEqual([]);
  });
});
