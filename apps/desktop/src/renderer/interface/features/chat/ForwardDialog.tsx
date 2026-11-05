import { Hash, UsersThree } from '@phosphor-icons/react';
import { useMemo, useState } from 'react';
import { useClosedDmStore } from '@discordy/core/application/stores/closedDmStore';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useUiStore, type Dialog } from '@discordy/core/application/stores/uiStore';
import { forwardSnapshot, forwardTargets, type ForwardTarget } from '@discordy/core/domain/forward';
import { permissionsInChannel } from '@discordy/core/application/forwardCommands';
import { ChannelType, type Channel } from '@discordy/core/contracts/rest';
import { forwardMessage } from '../../app/actions';
import { getRuntime } from '../../app/runtime';
import { displayName } from '../../shared/hooks/useNames';
import { Avatar } from '../../shared/ui/Avatar';
import { Button } from '../../shared/ui/Button';
import { Input } from '../../shared/ui/Form';
import { Modal } from '../../shared/ui/Modal';

type ForwardDialogProps = { message: Extract<Dialog, { kind: 'forward' }>['message'] };

function dmName(channel: Channel): string {
  const recipients = channel.recipients ?? [];
  if (channel.type === ChannelType.GROUP_DM) return channel.name || recipients.map((u) => displayName(u)).join(', ') || 'Group';
  return recipients[0] ? displayName(recipients[0]) : 'Direct message';
}

/** Picker for "Forward": recent DMs and group DMs, then channels the user can send in, with an optional comment. */
export function ForwardDialog({ message }: ForwardDialogProps) {
  const [query, setQuery] = useState('');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const channels = useGuildStore((s) => s.channels);
  const guilds = useGuildStore((s) => s.guilds);
  const closed = useClosedDmStore((s) => s.closed);
  const close = () => useUiStore.getState().openDialog(null);
  const hasAttachments = message.attachments.length > 0 || (forwardSnapshot(message)?.attachments.length ?? 0) > 0;
  const targets = useMemo(
    () => forwardTargets({ channels, guilds, closed, query, hasAttachments, dmName, modeOf: (c) => getRuntime().privacy.sender.resolveMode(c), permissionsOf: permissionsInChannel }),
    [channels, guilds, closed, query, hasAttachments],
  );
  const send = async (target: ForwardTarget) => {
    setBusy(target.id);
    const ok = await forwardMessage(message, target.id, comment);
    setBusy(null);
    if (ok) close();
  };
  const preview = forwardSnapshot(message)?.content ?? message.content;
  return (
    <Modal open onClose={close} title="Forward to" description="Pick a conversation or channel. The message is copied; the original stays where it is.">
      <div className="stack">
        <Input data-autofocus placeholder="Search for people, groups or channels" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search destinations" />
        <ul className="pick-list forward-list">
          {targets.map((t) => (
            <li key={t.id}>
              <div className={`pick-row forward-row${t.disabledReason ? ' is-disabled' : ''}`} title={t.disabledReason}>
                {t.kind === 'channel' ? <Hash size={22} aria-hidden="true" /> : t.kind === 'group' ? <UsersThree size={22} aria-hidden="true" /> : <Avatar id={t.id} name={t.label} avatar={channels[t.id]?.recipients?.[0]?.avatar ?? null} size={30} />}
                <span className="forward-label">{t.label}{t.context && <small> {t.context}</small>}</span>
                <Button variant="ghost" size="sm" disabled={Boolean(t.disabledReason) || busy !== null} loading={busy === t.id} onClick={() => void send(t)} aria-label={`Send to ${t.label}`}>
                  Send
                </Button>
              </div>
            </li>
          ))}
          {targets.length === 0 && <li className="pick-empty">Nothing matches.</li>}
        </ul>
        {preview && <blockquote className="forward-preview">{preview.length > 200 ? `${preview.slice(0, 200)}...` : preview}</blockquote>}
        <Input placeholder="Add an optional message" value={comment} maxLength={2000} onChange={(e) => setComment(e.target.value)} aria-label="Optional message" />
      </div>
    </Modal>
  );
}
