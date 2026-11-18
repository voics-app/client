import { useI18n } from '../../shared/i18n';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import { PRUNE_DAY_CHOICES, pruneSummary } from '@discordy/core/domain/moderationTools';
import { attempt, errorMessage } from '../../app/actions';
import { getRuntime } from '../../app/runtime';
import { Button } from '../../shared/ui/Button';
import { Field, Select } from '../../shared/ui/Form';
import { Modal } from '../../shared/ui/Modal';

/** Prune members: pick the inactivity window, see the dry-run count, then confirm. */
export function PruneDialog({ guildId }: { guildId: string }) {
  const { t: msg, locale } = useI18n();
  const [days, setDays] = useState(7);
  const [busy, setBusy] = useState(false);
  const close = () => useUiStore.getState().openDialog(null);
  const preview = useQuery({ queryKey: ['guild', guildId, 'prune', days], queryFn: () => getRuntime().api.pruneCount(guildId, days), gcTime: 0 });
  const count = preview.data?.pruned ?? 0;

  const submit = async () => {
    setBusy(true);
    const done = await attempt(() => getRuntime().api.prune(guildId, days), msg("settings.prunedialog.could.not.prune.members"));
    setBusy(false);
    if (!done) return;
    close();
    useUiStore.getState().toast({ tone: 'info', title: msg('members.pruned', { count: done.pruned }) });
  };

  return (
    <Modal open onClose={close} title={msg("settings.servertabs.prune.members")} description={msg("settings.prunedialog.remove.members.who.have.been.inactive.and.have.no")} width={420}>
      <div className="stack">
        <Field label={msg("settings.prunedialog.inactive.for")}>
          {(id) => (
            <Select id={id} value={days} onChange={(e) => setDays(Number(e.target.value))}>
              {PRUNE_DAY_CHOICES.map((d) => <option key={d} value={d}>{msg('members.days', { count: d })}</option>)}
            </Select>
          )}
        </Field>
        <p className="setting-desc" role="status" aria-live="polite">
          {preview.isError ? errorMessage(preview.error) : preview.isLoading ? msg("settings.prunedialog.counting.members") : pruneSummary(count, days, locale)}
        </p>
        <div className="row-end">
          <Button variant="ghost" type="button" onClick={close}>{msg("common.cancel")}</Button>
          <Button variant="danger" type="button" loading={busy} disabled={!preview.data || count === 0} onClick={() => void submit()}>
            {count > 0 ? msg('members.prune', { count }) : msg("settings.prunedialog.prune")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
