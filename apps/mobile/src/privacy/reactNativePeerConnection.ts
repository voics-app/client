/**
 * Peer connections for the P2P service, from @livekit/react-native-webrtc. The library's RTCPeerConnection and
 * RTCDataChannel already have the shape of `PeerConnectionLike` and `DataChannelLike` (event attributes,
 * `candidate: null` when gathering ends, ArrayBuffer binary messages), so this is a typed seam, not a wrapper:
 * the cast is the one place that states that equivalence.
 *
 * Binary frames cross the native bridge as base64 in both directions (RTCDataChannel.send and onmessage),
 * which adds a third to every 16 KiB file chunk; tests/privacy/chunkOverhead.test.ts measures it.
 */
import type { PeerConnectionConfig, PeerConnectionLike } from '@discordy/core/application/privacy/p2pService';

export interface WebRtcPeerModule {
  RTCPeerConnection: new (config: { iceServers: PeerConnectionConfig['iceServers'] }) => unknown;
}

export type PeerConnectionFactory = (config: PeerConnectionConfig) => PeerConnectionLike;

export function createReactNativePeerConnection(webrtc: WebRtcPeerModule): PeerConnectionFactory {
  return (config) => new webrtc.RTCPeerConnection({ iceServers: config.iceServers }) as PeerConnectionLike;
}
