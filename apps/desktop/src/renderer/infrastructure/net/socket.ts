import type { SocketFactory, SocketLike } from '@discordy/core/infrastructure/net/socket';

export const browserSocketFactory: SocketFactory = (url) => new WebSocket(url) as unknown as SocketLike;
