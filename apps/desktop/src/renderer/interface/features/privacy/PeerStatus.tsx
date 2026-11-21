import { useI18n } from '../../shared/i18n';
import { Fingerprint, Plugs, ShieldWarning } from '@phosphor-icons/react';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { usePrivacyStore } from '@discordy/core/application/stores/privacyStore';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import type { Channel, DeliveryMode } from '@discordy/core/contracts/rest';
import { Spinner } from '../../shared/ui/Spinner';

/** Honest per-mode connection state shown above the composer. Renders nothing for healthy standard chats. */
export function PeerStatus({ channel, mode }: { channel: Channel; mode: DeliveryMode }) {
  const { t: msg } = useI18n();
  const p2p = usePrivacyStore((s) => s.p2p[channel.id]);
  const group = usePrivacyStore((s) => s.groups[channel.id]);
  const openDialog = useUiStore((s) => s.openDialog);
  const peer = useGuildStore((s) => s.channels[channel.id]?.recipients?.[0]);

  if (mode === 'p2p') {
    const state = p2p?.state ?? 'idle';
    if (state === 'open') {
      return (
        <div className="peer-status is-ok">
          <Plugs size={14} weight="fill" /> {p2p?.verified ? msg("peer.verified") : msg("settings.peerstatus.direct.link.open")}
          {peer && <button type="button" onClick={() => openDialog({ kind: 'profile', userId: peer.id, guildId: null })}><Fingerprint size={13} /> {msg("settings.profiledialog.safety.number")}</button>}
        </div>
      );
    }
    if (state === 'connecting') return <div className="peer-status"><Spinner size={13} /> {msg("settings.peerstatus.connecting.directly.to.your.peer")}</div>;
    if (state === 'peer_offline') return <div className="peer-status is-warn" role="status"><Plugs size={14} /> {msg("settings.peerstatus.peer.offline.messages.cannot.be.sent.until.they.come")}</div>;
    if (state === 'unverified') return <div className="peer-status is-danger" role="alert"><ShieldWarning size={14} weight="fill" /> {msg("settings.peerstatus.peer.identity.could.not.be.verified.sending.is.blocked")} {p2p?.detail}</div>;
    if (state === 'failed') return <div className="peer-status is-warn" role="status"><ShieldWarning size={14} /> {msg("settings.peerstatus.direct.connection.failed")} {p2p?.detail}</div>;
    return <div className="peer-status">{msg("settings.peerstatus.peer.to.peer.a.direct.link.opens.when.you")}</div>;
  }
  if (mode === 'ephemeral') {
    if (group?.state === 'error') return <div className="peer-status is-danger" role="alert"><ShieldWarning size={14} weight="fill" /> {msg("peer.encryptionUnavailable", { detail: group.detail ?? msg("peer.blocked") })}</div>;
    if (group?.state === 'establishing') return <div className="peer-status"><Spinner size={13} /> {msg("settings.peerstatus.establishing.the.encrypted.group")}</div>;
  }
  return null;
}
