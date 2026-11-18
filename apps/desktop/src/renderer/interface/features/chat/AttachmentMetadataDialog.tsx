import { useCallback, useRef, useState } from 'react';
import type { ChatMessage } from '@discordy/core/application/stores/messageStore';
import { editAttachments } from '@discordy/core/application/attachmentCommands';
import { errorMessage } from '@discordy/core/application/errorMessage';
import { attachmentDraft, attachmentMetadataEdits, type AttachmentDraft } from '@discordy/core/domain/attachmentEdits';
import { ALT_TEXT_MAX, displayFilename } from '@discordy/core/domain/media';
import { getRuntime } from '../../app/runtime';
import { Button } from '../../shared/ui/Button';
import { Field, SettingRow, Switch, TextArea } from '../../shared/ui/Form';
import { Modal } from '../../shared/ui/Modal';
import './attachmentMetadata.css';

/** Keeps a stable opening snapshot so unrelated incoming edits are not written back. */
export function AttachmentMetadataDialog({ message, onClose }: { message: ChatMessage; onClose: () => void }) {
  const [original] = useState(() => message.attachments);
  const [drafts, setDrafts] = useState(() => original.map(attachmentDraft));
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const close = useCallback(() => { if (!busyRef.current) onClose(); }, [onClose]);
  const invalid = drafts.some((draft) => [...draft.description.trim()].length > ALT_TEXT_MAX);
  const edits = invalid ? [] : attachmentMetadataEdits(original, drafts);
  const update = (id: string, patch: Partial<AttachmentDraft>) => {
    setDrafts((current) => current.map((draft) => draft.id === id ? { ...draft, ...patch } : draft));
    setError(null);
  };
  const save = async () => {
    if (busyRef.current || invalid || edits.length === 0) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await editAttachments(getRuntime().api, message, edits);
      onClose();
    } catch (failure) {
      setError(`Could not save attachments. ${errorMessage(failure)}`);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={close} width="min(440px, calc(100vw - 48px))" title="Edit attachments" description="Update descriptions and spoiler settings for this message."
      footer={<><Button onClick={close} disabled={busy}>Cancel</Button><Button variant="primary" loading={busy} disabled={invalid || edits.length === 0} onClick={() => void save()}>Save changes</Button></>}>
      <div className="attachment-edit-list">
        {drafts.map((draft, index) => {
          const name = displayFilename(original[index]!.filename);
          const count = [...draft.description.trim()].length;
          return (
            <fieldset key={draft.id} className="attachment-edit-item" disabled={busy}>
              <legend className="attachment-edit-name">{name}</legend>
              <Field label="Description" error={count > ALT_TEXT_MAX ? `Use ${ALT_TEXT_MAX} characters or fewer.` : null}
                hint={<span className="attachment-edit-count tnum">{count} / {ALT_TEXT_MAX}</span>}>
                {(id) => <TextArea id={id} data-autofocus={index === 0 ? true : undefined} rows={3} value={draft.description}
                  placeholder="Describe this attachment" aria-invalid={count > ALT_TEXT_MAX || undefined}
                  onChange={(event) => update(draft.id, { description: event.target.value })} />}
              </Field>
              <SettingRow title="Mark as spoiler" description="Hide this file until someone reveals it.">
                <Switch checked={draft.spoiler} onChange={(spoiler) => update(draft.id, { spoiler })} label={`Mark ${name} as spoiler`} disabled={busy} />
              </SettingRow>
            </fieldset>
          );
        })}
      </div>
      {error && <p className="field-error" role="alert">{error}</p>}
    </Modal>
  );
}
