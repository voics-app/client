/** Minimal WebSocket surface so protocol clients can be tested with fakes. */
export interface SocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: (() => void) | null;
  onmessage: ((event: { data: string }) => void) | null;
  onclose: ((event: { code: number; reason: string }) => void) | null;
  onerror: (() => void) | null;
}

export type SocketFactory = (url: string) => SocketLike;

export const browserSocketFactory: SocketFactory = (url) => new WebSocket(url) as unknown as SocketLike;

export const SOCKET_OPEN = 1;
