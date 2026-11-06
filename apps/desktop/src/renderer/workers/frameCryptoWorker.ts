/**
 * Dedicated worker that protects/unprotects encoded media frames. It is driven
 * by RTCRtpScriptTransform (`onrtctransform`) or, on older Chromium, by encoded
 * streams posted from the main thread. Frames that cannot be protected or
 * authenticated are dropped, never forwarded in clear: a frame without a valid
 * protection trailer, a frame whose key is unknown, and a frame that fails
 * authentication all disappear, and a sender with no active key sends nothing.
 */
import { FrameKeyring, IvSource, decryptFrame, encryptFrame, readKeyIndex, type MediaKind } from './frameCrypto';

export interface TransformOptions {
  operation: 'encrypt' | 'decrypt';
  kind: MediaKind;
  codec: string;
  /** Sender whose keys apply: our own id for encrypt, the remote user for decrypt. */
  userId: string;
}

export type WorkerMessage =
  | { type: 'key'; userId: string; keyIndex: number; key: CryptoKey }
  | { type: 'activate'; generation: number }
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
  const ivs = new IvSource();
  return new TransformStream<EncodedFrame, EncodedFrame>({
    async transform(frame, controller) {
      const data = new Uint8Array(frame.data);
      try {
        if (options.operation === 'encrypt') {
          const keyIndex = keyring.sendKeyIndex;
          const key = keyIndex === null ? null : keyring.key(options.userId, keyIndex);
          if (keyIndex === null || !key) return;
          frame.data = toBuffer(await encryptFrame(key, ivs.next(), keyIndex, options.kind, options.codec, data));
          controller.enqueue(frame);
          return;
        }
        const keyIndex = readKeyIndex(data, options.kind, options.codec);
        if (keyIndex === null) return;
        const key = keyring.key(options.userId, keyIndex);
        if (!key) return;
        const plain = await decryptFrame(key, options.kind, options.codec, data);
        if (!plain) return;
        frame.data = toBuffer(plain);
        controller.enqueue(frame);
      } catch {
        // Authentication failure, unsupported codec or exhausted IVs: drop the frame.
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
    case 'key':
      keyring.setKey(message.userId, message.keyIndex, message.key);
      break;
    case 'activate':
      keyring.activate(message.generation);
      break;
    case 'clear':
      keyring.clear();
      break;
    case 'streams':
      attach(message.options, message.readable, message.writable);
      break;
  }
};
