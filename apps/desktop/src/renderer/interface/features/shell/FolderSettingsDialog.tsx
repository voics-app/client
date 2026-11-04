import { useState, type FormEvent } from 'react';
import { useGuildStore } from '@renderer/application/stores/guildStore';
import { useUiStore } from '@renderer/application/stores/uiStore';
import { FOLDER_COLORS, MAX_FOLDER_NAME, patchFolder } from '@discordy/core/domain/railLayout';
import { saveRail } from '../../app/actions';
import { Button } from '../../shared/ui/Button';
import { Field, Input } from '../../shared/ui/Form';
import { Modal } from '../../shared/ui/Modal';

const hex = (color: number) => `#${color.toString(16).padStart(6, '0')}`;

/** Name and colour of a server folder; saved with the rest of the rail layout so every device sees it. */
export function FolderSettingsDialog({ folderId }: { folderId: number }) {
  const folder = useGuildStore((s) => s.rail.find((e) => e.id === folderId));
  const [name, setName] = useState(folder?.name ?? '');
  const [color, setColor] = useState<number | null>(folder?.color ?? FOLDER_COLORS[0]);
  const close = () => useUiStore.getState().openDialog(null);
  if (!folder) return null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void saveRail(patchFolder(useGuildStore.getState().rail, folderId, { name, color }));
    close();
  };

  return (
    <Modal open onClose={close} title="Folder settings" width={400}>
      <form onSubmit={submit}>
        <Field label="Folder name" hint="Leave empty to list the server names.">
          {(id) => <Input id={id} value={name} maxLength={MAX_FOLDER_NAME} onChange={(e) => setName(e.target.value)} data-autofocus />}
        </Field>
        <div role="radiogroup" aria-label="Folder colour" className="folder-colors">
          {FOLDER_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={color === c}
              aria-label={hex(c)}
              className={`folder-color${color === c ? ' is-selected' : ''}`}
              style={{ background: hex(c) }}
              onClick={() => setColor(c)}
            />
          ))}
        </div>
        <div className="row-end">
          <Button variant="ghost" type="button" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" type="submit">
            Save
          </Button>
        </div>
      </form>
    </Modal>
  );
}
