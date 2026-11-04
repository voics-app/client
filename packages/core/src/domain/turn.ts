/** Pure helpers turning the gateway's TURN credentials into WebRTC ICE servers. */
import type { TurnCredentials } from '../contracts/rest';

export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

const DEFAULT_STUN_PORT = 3478;
const MIN_REFRESH_MS = 30_000;
const REFRESH_FRACTION = 0.8;

/** `turn:host:port?transport=udp` / `turns:host` to `stun:host:port`; null when unparseable. */
function stunUrl(turnUrl: string): string | null {
  const match = /^turns?:(\[[^\]]+\]|[^:?/]+)(?::(\d+))?(?:\?.*)?$/i.exec(turnUrl.trim());
  if (!match) return null;
  return `stun:${match[1]}:${match[2] ?? DEFAULT_STUN_PORT}`;
}

export function iceServersFromTurn(turn: TurnCredentials | null | undefined): IceServer[] {
  if (!turn) return [];
  const stun = [...new Set(turn.urls.map(stunUrl).filter((u): u is string => u !== null))];
  const servers: IceServer[] = stun.length > 0 ? [{ urls: stun }] : [];
  servers.push({ urls: turn.urls, username: turn.username, credential: turn.credential });
  return servers;
}

/** Refresh well before expiry so a new READY lands while the old credential still works. */
export function refreshDelayMs(ttlSeconds: number): number {
  return Math.max(MIN_REFRESH_MS, Math.floor(ttlSeconds * 1000 * REFRESH_FRACTION));
}
