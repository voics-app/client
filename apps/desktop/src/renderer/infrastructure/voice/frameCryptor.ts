/**
 * Main-thread side of media E2EE. Owns the frame crypto worker, attaches it to
 * RTP senders/receivers (RTCRtpScriptTransform, or Chromium encoded streams as
 * a fallback) and feeds it epoch keys.
 */
import { importEpochBase, type MediaKind } from '@renderer/workers/frameCrypto';
import type { TransformOptions, WorkerMessage } from '@renderer/workers/frameCryptoWorker';

export interface WorkerLike {
  postMessage(message: WorkerMessage, transfer?: Transferable[]): void;
  terminate(): void;
}

export interface FrameCryptorPort {
  /** False when neither transform API exists; callers must then refuse E2EE rather than send clear media. */
  readonly supported: boolean;
  attachSender(sender: RTCRtpSender, kind: MediaKind, codec: string, userId: string): void;
  attachReceiver(receiver: RTCRtpReceiver, kind: MediaKind, codec: string, userId: string): void;
  setEpoch(generation: number, secret: Uint8Array): Promise<void>;
  activate(generation: number): void;
  setPassthrough(value: boolean): void;
  clear(): void;
  dispose(): void;
}

type ScriptTransformCtor = new (worker: Worker, options: TransformOptions) => unknown;

interface EncodedStreamsEndpoint {
  transform?: unknown;
  createEncodedStreams?: () => { readable: ReadableStream; writable: WritableStream };
}

export const defaultWorkerFactory = (): WorkerLike =>
  new Worker(new URL('../../workers/frameCryptoWorker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike;

export class FrameCryptor implements FrameCryptorPort {
  private worker: WorkerLike | null = null;
  private readonly scriptTransform: ScriptTransformCtor | undefined;

  constructor(
    private readonly workerFactory: () => WorkerLike = defaultWorkerFactory,
    scriptTransform: ScriptTransformCtor | undefined = (globalThis as { RTCRtpScriptTransform?: ScriptTransformCtor }).RTCRtpScriptTransform,
    private readonly legacyStreams: boolean = typeof RTCRtpSender !== 'undefined' && 'createEncodedStreams' in RTCRtpSender.prototype,
  ) {
    this.scriptTransform = scriptTransform;
  }

  get supported(): boolean {
    return this.scriptTransform !== undefined || this.legacyStreams;
  }

  private ensureWorker(): WorkerLike {
    this.worker ??= this.workerFactory();
    return this.worker;
  }

  private attach(endpoint: RTCRtpSender | RTCRtpReceiver, options: TransformOptions): void {
    const worker = this.ensureWorker();
    if (this.scriptTransform) {
      (endpoint as EncodedStreamsEndpoint).transform = new this.scriptTransform(worker as unknown as Worker, options);
      return;
    }
    const legacy = endpoint as EncodedStreamsEndpoint;
    if (!legacy.createEncodedStreams) throw new Error('media E2EE is not supported by this runtime');
    const { readable, writable } = legacy.createEncodedStreams();
    worker.postMessage({ type: 'streams', options, readable, writable }, [readable, writable]);
  }

  attachSender(sender: RTCRtpSender, kind: MediaKind, codec: string, userId: string): void {
    this.attach(sender, { operation: 'encrypt', kind, codec, userId });
  }

  attachReceiver(receiver: RTCRtpReceiver, kind: MediaKind, codec: string, userId: string): void {
    this.attach(receiver, { operation: 'decrypt', kind, codec, userId });
  }

  async setEpoch(generation: number, secret: Uint8Array): Promise<void> {
    const base = await importEpochBase(secret);
    this.ensureWorker().postMessage({ type: 'epoch', generation, base });
  }

  activate(generation: number): void {
    this.ensureWorker().postMessage({ type: 'activate', generation });
  }

  setPassthrough(value: boolean): void {
    this.ensureWorker().postMessage({ type: 'passthrough', value });
  }

  clear(): void {
    this.worker?.postMessage({ type: 'clear' });
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
  }
}
