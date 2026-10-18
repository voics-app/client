/** Browser RTCPeerConnection adapter for the P2P service. */
import type { PeerConnectionConfig, PeerConnectionLike } from '@renderer/application/privacy/p2pService';

export function browserPeerConnection(config: PeerConnectionConfig): PeerConnectionLike {
  return new RTCPeerConnection({ iceServers: config.iceServers }) as unknown as PeerConnectionLike;
}
