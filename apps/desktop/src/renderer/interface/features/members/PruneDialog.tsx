import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useUiStore } from '@renderer/application/stores/uiStore';
import { PRUNE_DAY_CHOICES, pruneSummary } from '@discordy/core/domain/moderationTools';
import { attempt, errorMessage } from '../../app/actions';
import { getRuntime } from '../../app/runtime';
import { Button } from '../../shared/ui/Button';
import { Field, Select } from '../../shared/ui/Form';
import { Modal } from '../../shared/ui/Modal';

/** Prune members: pick the inactivity window, see the dry-run count, then confirm. */
export function PruneDialog({ guildId }: { guildId: string }) {
  const [days, setDays] = useState(7);
  const [busy, setBusy] = useState(false);
  const close = () => useUiStore.getState().openDialog(null);
  const preview = useQuery({ queryKey: ['guild', guildId, 'prune', days], queryFn: () => getRuntime().api.pruneCount(guildId, days), gcTime: 0 });
  const count = preview.data?.pruned ?? 0;

  const submit = async () => {
    setBusy(true);
    const done = await attempt(() => getRuntime().api.prune(guildId, days), 'Could not prune members');
    setBusy(false);
    if (!done) return;
    close();
    useUiStore.getState().toast({ tone: 'info', title: `Pruned ${done.pruned} ${done.pruned === 1 ? 'member' : 'members'}` });
  };

  return (
    <Modal open onClose={close} title="Prune members" description="Remove members who have been inactive and have no roles. They can rejoin with a new invite." width={420}>
      <div className="stack">
        <Field label="Inactive for">
          {(id) => (
            <Select id={id} value={days} onChange={(e) => setDays(Number(e.target.value))}>
              {PRUNE_DAY_CHOICES.map((d) => <option key={d} value={d}>{d} {d === 1 ? 'day' : 'days'}</option>)}
            </Select>
          )}
        </Field>
        <p className="setting-desc" role="status" aria-live="polite">
          {preview.isError ? errorMessage(preview.error) : preview.isLoading ? 'Counting members' : pruneSummary(count, days)}
        </p>
        <div className="row-end">
          <Button variant="ghost" type="button" onClick={close}>Cancel</Button>
          <Button variant="danger" type="button" loading={busy} disabled={!preview.data || count === 0} onClick={() => void submit()}>
            {count > 0 ? `Prune ${count} ${count === 1 ? 'member' : 'members'}` : 'Prune'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
