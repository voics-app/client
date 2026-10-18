import type { SocketLike } from '@renderer/infrastructure/net/socket';

export class FakeSocket implements SocketLike {
  static instances: FakeSocket[] = [];
  readyState = 0;
  sent: { op: number; d: unknown }[] = [];
  closedWith: number | null = null;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(public readonly url: string) {
    FakeSocket.instances.push(this);
  }

  static reset(): void {
    FakeSocket.instances = [];
  }

  static latest(): FakeSocket {
    const s = FakeSocket.instances[FakeSocket.instances.length - 1];
    if (!s) throw new Error('no socket');
    return s;
  }

  open(): void {
    this.readyState = 1;
    this.onopen?.();
  }

  receive(frame: unknown): void {
    this.onmessage?.({ data: JSON.stringify(frame) });
  }

  send(data: string): void {
    this.sent.push(JSON.parse(data) as { op: number; d: unknown });
  }

  close(code = 1000): void {
    this.closedWith = code;
    this.readyState = 3;
  }

  /** Simulates the server closing the connection. */
  serverClose(code: number): void {
    this.readyState = 3;
    this.onclose?.({ code, reason: '' });
  }

  ops(): number[] {
    return this.sent.map((f) => f.op);
  }
}
