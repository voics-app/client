/** What the strip above the composer says about a private chat. The words match the desktop PeerStatus. */
import type { DeliveryMode } from '@discordy/core/contracts/rest';
import type { GroupState, P2PLinkState } from '@discordy/core/application/stores/privacyStore';

export type StatusTone = 'info' | 'ok' | 'warn' | 'danger';

export interface PeerStatusLine {
  tone: StatusTone;
  text: string;
  /** Show a spinner: something is being set up. */
  busy?: boolean;
  /** Offer the safety number: the direct link is open to someone whose identity can be compared. */
  safetyNumber?: boolean;
}

export interface PeerStatusInput {
  mode: DeliveryMode;
  p2p?: { state: P2PLinkState; verified: boolean; detail?: string | undefined } | undefined;
  group?: { state: GroupState; detail?: string | undefined } | undefined;
}

export function peerStatusLine({ mode, p2p, group }: PeerStatusInput): PeerStatusLine | null {
  if (mode === 'p2p') {
    const state = p2p?.state ?? 'idle';
    if (state === 'open') return { tone: 'ok', text: `Direct link open${p2p?.verified ? ', identity verified' : ''}`, safetyNumber: true };
    if (state === 'connecting') return { tone: 'info', text: 'Connecting directly to your peer', busy: true };
    if (state === 'peer_offline') return { tone: 'warn', text: 'Peer offline. Messages cannot be sent until they come online. Nothing is stored on any server.' };
    if (state === 'unverified') return { tone: 'danger', text: `Peer identity could not be verified. Sending is blocked. ${p2p?.detail ?? ''}`.trim() };
    if (state === 'failed') return { tone: 'warn', text: `Direct connection failed. ${p2p?.detail ?? ''}`.trim() };
    return { tone: 'info', text: 'Peer-to-peer: a direct link opens when you send. The peer must be online.' };
  }
  if (mode === 'ephemeral') {
    if (group?.state === 'error') {
      return { tone: 'danger', text: `Encryption unavailable: ${group.detail ?? 'sending is blocked'}. Messages are never sent unencrypted in this mode.` };
    }
    if (group?.state === 'establishing') return { tone: 'info', text: 'Establishing the encrypted group', busy: true };
  }
  return null;
}
