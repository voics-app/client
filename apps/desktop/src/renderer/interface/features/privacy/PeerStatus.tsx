import { Fingerprint, Plugs, ShieldWarning } from '@phosphor-icons/react';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { usePrivacyStore } from '@discordy/core/application/stores/privacyStore';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import type { Channel, DeliveryMode } from '@discordy/core/contracts/rest';
import { Spinner } from '../../shared/ui/Spinner';

/** Honest per-mode connection state shown above the composer. Renders nothing for healthy standard chats. */
export function PeerStatus({ channel, mode }: { channel: Channel; mode: DeliveryMode }) {
  const p2p = usePrivacyStore((s) => s.p2p[channel.id]);
  const group = usePrivacyStore((s) => s.groups[channel.id]);
  const openDialog = useUiStore((s) => s.openDialog);
  const peer = useGuildStore((s) => s.channels[channel.id]?.recipients?.[0]);

  if (mode === 'p2p') {
    const state = p2p?.state ?? 'idle';
    if (state === 'open') {
      return (
        <div className="peer-status is-ok">
          <Plugs size={14} weight="fill" /> Direct link open{p2p?.verified ? ', identity verified' : ''}
          {peer && <button type="button" onClick={() => openDialog({ kind: 'profile', userId: peer.id, guildId: null })}><Fingerprint size={13} /> Safety number</button>}
        </div>
      );
    }
    if (state === 'connecting') return <div className="peer-status"><Spinner size={13} /> Connecting directly to your peer</div>;
    if (state === 'peer_offline') return <div className="peer-status is-warn" role="status"><Plugs size={14} /> Peer offline. Messages cannot be sent until they come online. Nothing is stored on any server.</div>;
    if (state === 'unverified') return <div className="peer-status is-danger" role="alert"><ShieldWarning size={14} weight="fill" /> Peer identity could not be verified. Sending is blocked. {p2p?.detail}</div>;
    if (state === 'failed') return <div className="peer-status is-warn" role="status"><ShieldWarning size={14} /> Direct connection failed. {p2p?.detail}</div>;
    return <div className="peer-status">Peer-to-peer: a direct link opens when you send. The peer must be online.</div>;
  }
  if (mode === 'ephemeral') {
    if (group?.state === 'error') return <div className="peer-status is-danger" role="alert"><ShieldWarning size={14} weight="fill" /> Encryption unavailable: {group.detail ?? 'sending is blocked'}. Messages are never sent unencrypted in this mode.</div>;
    if (group?.state === 'establishing') return <div className="peer-status"><Spinner size={13} /> Establishing the encrypted group</div>;
  }
  return null;
}
