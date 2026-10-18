/**
 * Dedicated worker that protects/unprotects encoded media frames. It is driven
 * by RTCRtpScriptTransform (`onrtctransform`) or, on older Chromium, by encoded
 * streams posted from the main thread. Frames that cannot be protected or
 * authenticated are dropped, never forwarded in clear while a key is required.
 */
import { FrameKeyring, decryptFrame, encryptFrame, readGeneration, type MediaKind } from './frameCrypto';

export interface TransformOptions {
  operation: 'encrypt' | 'decrypt';
  kind: MediaKind;
  codec: string;
  /** Sender whose keys apply: our own id for encrypt, the remote user for decrypt. */
  userId: string;
}

export type WorkerMessage =
  | { type: 'epoch'; generation: number; base: CryptoKey }
  | { type: 'activate'; generation: number }
  | { type: 'passthrough'; value: boolean }
  | { type: 'clear' }
  | { type: 'streams'; options: TransformOptions; readable: ReadableStream; writable: WritableStream };

interface EncodedFrame {
  data: ArrayBuffer;
}

interface TransformerLike {
  readable: ReadableStream;
  writable: WritableStream;
  options: TransformOptions;
}

interface WorkerScope {
  onmessage: ((event: { data: WorkerMessage }) => void) | null;
  onrtctransform: ((event: { transformer: TransformerLike }) => void) | null;
}

const scope = globalThis as unknown as WorkerScope;
const keyring = new FrameKeyring();

const toBuffer = (bytes: Uint8Array): ArrayBuffer => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

function pipeline(options: TransformOptions): TransformStream<EncodedFrame, EncodedFrame> {
  let counter = 0;
  return new TransformStream<EncodedFrame, EncodedFrame>({
    async transform(frame, controller) {
      const data = new Uint8Array(frame.data);
      try {
        if (options.operation === 'encrypt') {
          const generation = keyring.sendGeneration;
          const key = generation === null ? null : keyring.senderKey(options.userId, generation);
          if (generation === null || !key) return;
          counter = (counter + 1) >>> 0;
          frame.data = toBuffer(await encryptFrame(await key, counter, generation, options.kind, options.codec, data));
          controller.enqueue(frame);
          return;
        }
        const generation = readGeneration(data, options.kind, options.codec);
        if (generation === null) {
          if (keyring.passthrough) controller.enqueue(frame);
          return;
        }
        const key = keyring.senderKey(options.userId, generation);
        if (!key) return;
        const plain = await decryptFrame(await key, options.kind, options.codec, data);
        if (!plain) return;
        frame.data = toBuffer(plain);
        controller.enqueue(frame);
      } catch {
        // Authentication failure or key not ready: drop the frame.
      }
    },
  });
}

function attach(options: TransformOptions, readable: ReadableStream, writable: WritableStream): void {
  void readable.pipeThrough(pipeline(options) as unknown as { readable: ReadableStream; writable: WritableStream }).pipeTo(writable);
}

scope.onrtctransform = (event) => attach(event.transformer.options, event.transformer.readable, event.transformer.writable);

scope.onmessage = (event) => {
  const message = event.data;
  switch (message.type) {
    case 'epoch':
      keyring.setEpoch(message.generation, message.base);
      break;
    case 'activate':
      keyring.sendGeneration = message.generation & 0xff;
      break;
    case 'passthrough':
      keyring.passthrough = message.value;
      break;
    case 'clear':
      keyring.clear();
      break;
    case 'streams':
      attach(message.options, message.readable, message.writable);
      break;
  }
};
