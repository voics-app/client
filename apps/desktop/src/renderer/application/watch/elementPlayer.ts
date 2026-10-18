/** Adapts an HTMLMediaElement (video or audio) to the Watch Together `PlayerPort`. */
import type { PlayerPort, UserPlayerAction } from './watchTogetherService';
import type { WatchSource } from './watchUrl';

export interface MediaElementLike {
  currentTime: number;
  readonly paused: boolean;
  src: string;
  play(): Promise<void>;
  pause(): void;
  load(): void;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

export class ElementPlayer implements PlayerPort {
  /** Events caused by our own calls, to be swallowed instead of reported as user actions. */
  private readonly expected = new Map<'play' | 'pause' | 'seeked', number>();

  constructor(private readonly element: MediaElementLike) {}

  private expect(type: 'play' | 'pause' | 'seeked'): void {
    this.expected.set(type, (this.expected.get(type) ?? 0) + 1);
  }

  private consume(type: 'play' | 'pause' | 'seeked'): boolean {
    const n = this.expected.get(type) ?? 0;
    if (n <= 0) return false;
    this.expected.set(type, n - 1);
    return true;
  }

  load(source: WatchSource, localUrl?: string): Promise<void> {
    const url = source.kind === 'remote' ? source.url : localUrl;
    if (!url) return Promise.reject(new Error('No file selected'));
    return new Promise((resolve, reject) => {
      const ready = () => {
        cleanup();
        resolve();
      };
      const failed = () => {
        cleanup();
        reject(new Error('This source could not be played'));
      };
      const cleanup = () => {
        this.element.removeEventListener('loadedmetadata', ready);
        this.element.removeEventListener('error', failed);
      };
      this.element.addEventListener('loadedmetadata', ready);
      this.element.addEventListener('error', failed);
      if (!this.element.paused) this.expect('pause');
      this.element.src = url;
      this.element.load();
    });
  }

  async play(): Promise<void> {
    if (!this.element.paused) return;
    this.expect('play');
    try {
      await this.element.play();
    } catch (error) {
      this.consume('play');
      throw error;
    }
  }

  pause(): void {
    if (this.element.paused) return;
    this.expect('pause');
    this.element.pause();
  }

  seek(positionMs: number): void {
    if (Math.abs(this.element.currentTime * 1000 - positionMs) < 1) return;
    this.expect('seeked');
    this.element.currentTime = positionMs / 1000;
  }

  positionMs(): number {
    return this.element.currentTime * 1000;
  }

  isPlaying(): boolean {
    return !this.element.paused;
  }

  onUserAction(listener: (action: UserPlayerAction) => void): () => void {
    const emit = (action: UserPlayerAction['action'], type: 'play' | 'pause' | 'seeked') => () => {
      if (this.consume(type)) return;
      listener({ action, positionMs: this.positionMs() });
    };
    const handlers: [string, () => void][] = [
      ['play', emit('play', 'play')],
      ['pause', emit('pause', 'pause')],
      ['seeked', emit('seek', 'seeked')],
    ];
    for (const [type, handler] of handlers) this.element.addEventListener(type, handler);
    return () => {
      for (const [type, handler] of handlers) this.element.removeEventListener(type, handler);
    };
  }
}
