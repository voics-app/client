/**
 * Main-thread side of media E2EE. Owns the frame crypto worker, attaches it to
 * RTP senders/receivers (RTCRtpScriptTransform, or Chromium encoded streams as
 * a fallback) and feeds it the per-sender keys of each epoch.
 */
import type { FrameCryptorPort, KeyMaterialSource } from '@discordy/core/application/ports/voice';
import { EpochKeyBook } from '@discordy/core/application/voice/epochKeyBook';
import { importFrameKey, type MediaKind } from '@renderer/workers/frameCrypto';
import type { TransformOptions, WorkerMessage } from '@renderer/workers/frameCryptoWorker';

export interface WorkerLike {
  postMessage(message: WorkerMessage, transfer?: Transferable[]): void;
  terminate(): void;
}

export type { FrameCryptorPort };

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
  private readonly keys = new EpochKeyBook(async (userId, keyIndex, material) => {
    const key = await importFrameKey(material);
    this.ensureWorker().postMessage({ type: 'key', userId, keyIndex, key });
  });

  /** The worker drops frames itself, so a script transform or encoded stream is protected from its first frame. */
  readonly gated = false;

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

  async attachSender(sender: RTCRtpSender, kind: MediaKind, codec: string, userId: string): Promise<void> {
    this.attach(sender, { operation: 'encrypt', kind, codec, userId });
    await this.keys.addUser(userId);
  }

  async attachReceiver(receiver: RTCRtpReceiver, kind: MediaKind, codec: string, userId: string): Promise<void> {
    this.attach(receiver, { operation: 'decrypt', kind, codec, userId });
    await this.keys.addUser(userId);
  }

  bypass(endpoint: RTCRtpSender | RTCRtpReceiver): void {
    if (this.scriptTransform || !this.legacyStreams) return;
    const legacy = endpoint as EncodedStreamsEndpoint;
    if (!legacy.createEncodedStreams) return;
    const { readable, writable } = legacy.createEncodedStreams();
    void readable.pipeTo(writable).catch(() => undefined);
  }

  setEpoch(generation: number, material: KeyMaterialSource): Promise<void> {
    return this.keys.setEpoch(generation, material);
  }

  async activate(generation: number): Promise<void> {
    this.ensureWorker().postMessage({ type: 'activate', generation });
  }

  clear(): void {
    this.keys.clear();
    this.worker?.postMessage({ type: 'clear' });
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
  }
}
