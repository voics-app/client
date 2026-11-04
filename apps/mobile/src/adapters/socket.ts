import type { SocketFactory, SocketLike } from '@discordy/core/infrastructure/net/socket';

/** React Native's built-in WebSocket has the same surface the gateway client uses. */
export const nativeSocketFactory: SocketFactory = (url) => new WebSocket(url) as unknown as SocketLike;
