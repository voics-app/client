import { useState } from 'react';
import { submitReport } from '@discordy/core/application/reportCommands';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import {
  REPORT_CATEGORIES,
  REPORT_CONFIRMATION,
  REPORT_NOTE_MAX,
  canIncludeContent,
  canSubmitReport,
  emptyReportDraft,
  reportDisclosure,
  reportTitle,
  type ReportDraft,
  type ReportTarget,
} from '@discordy/core/domain/reportModel';
import { getRuntime } from '../../app/runtime';
import { Button } from '../../shared/ui/Button';
import { Checkbox, Field, TextArea } from '../../shared/ui/Form';
import { Modal } from '../../shared/ui/Modal';

/** Report a message or a user: pick what is wrong, add an optional note, see what is shared, send. */
export function ReportDialog({ target }: { target: ReportTarget }) {
  const [draft, setDraft] = useState<ReportDraft>(emptyReportDraft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const close = () => useUiStore.getState().openDialog(null);

  const send = async () => {
    setBusy(true);
    setError(null);
    const outcome = await submitReport(getRuntime().api, target, draft);
    setBusy(false);
    if (outcome.ok) setSent(true);
    else setError(outcome.message);
  };

  if (sent) {
    return (
      <Modal open onClose={close} title={REPORT_CONFIRMATION.title} description={REPORT_CONFIRMATION.body} width={420}>
        <div className="row-end">
          <Button variant="primary" type="button" data-autofocus onClick={close}>Done</Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open onClose={close} title={reportTitle(target)} description={reportDisclosure(target)} width={460}>
      <div className="stack">
        <fieldset className="report-categories">
          <legend>What is wrong?</legend>
          {REPORT_CATEGORIES.map((c) => (
            <label key={c.id} className="report-category">
              <input type="radio" name="report-category" value={c.id} checked={draft.category === c.id} onChange={() => setDraft({ ...draft, category: c.id })} />
              <span>
                <strong>{c.label}</strong>
                <small>{c.hint}</small>
              </span>
            </label>
          ))}
        </fieldset>
        <Field label="Note (optional)" hint={`${draft.note.length}/${REPORT_NOTE_MAX}`}>
          {(id) => <TextArea id={id} rows={3} maxLength={REPORT_NOTE_MAX} value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />}
        </Field>
        {canIncludeContent(target) && (
          <Checkbox checked={draft.includeContent} onChange={(includeContent) => setDraft({ ...draft, includeContent })} label="Send the text of this message with the report" />
        )}
        {error && <p role="alert" className="field-error">{error}</p>}
        <div className="row-end">
          <Button variant="ghost" type="button" onClick={close}>Cancel</Button>
          <Button variant="danger" type="button" loading={busy} disabled={!canSubmitReport(draft)} onClick={() => void send()}>Send report</Button>
        </div>
      </div>
    </Modal>
  );
}
