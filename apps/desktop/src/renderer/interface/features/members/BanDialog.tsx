import { useState } from 'react';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import { BAN_HISTORY_OPTIONS } from '@discordy/core/domain/userMenuModel';
import { attempt } from '../../app/actions';
import { getRuntime } from '../../app/runtime';
import { Button } from '../../shared/ui/Button';
import { Field, Input, Select } from '../../shared/ui/Form';
import { Modal } from '../../shared/ui/Modal';

/** Ban confirmation with Discord's "delete message history" window and an optional reason. */
export function BanDialog({ guildId, userId, name }: { guildId: string; userId: string; name: string }) {
  const [seconds, setSeconds] = useState(0);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const close = () => useUiStore.getState().openDialog(null);

  const submit = async () => {
    setBusy(true);
    const ok = await attempt(async () => {
      await getRuntime().api.ban(guildId, userId, reason.trim() || undefined, seconds > 0 ? { delete_message_seconds: seconds } : {});
      return true;
    }, 'Could not ban');
    setBusy(false);
    if (ok) close();
  };

  return (
    <Modal open onClose={close} title={`Ban ${name}?`} description='They will be removed and cannot rejoin until unbanned.' width={420}>
      <div className='stack'>
        <Field label='Delete message history'>
          {(id) => (
            <Select id={id} value={seconds} onChange={(e) => setSeconds(Number(e.target.value))}>
              {BAN_HISTORY_OPTIONS.map((o) => (
                <option key={o.seconds} value={o.seconds}>{o.label}</option>
              ))}
            </Select>
          )}
        </Field>
        <Field label='Reason (optional)'>
          {(id) => <Input id={id} value={reason} maxLength={256} onChange={(e) => setReason(e.target.value)} />}
        </Field>
        <div className='row-end'>
          <Button variant='ghost' type='button' onClick={close}>Cancel</Button>
          <Button variant='danger' type='button' loading={busy} onClick={() => void submit()}>Ban</Button>
        </div>
      </div>
    </Modal>
  );
}
