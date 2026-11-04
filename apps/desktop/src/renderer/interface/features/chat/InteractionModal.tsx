import { useEffect, useState, type FormEvent } from 'react';
import { useInteractionStore } from '@renderer/application/stores/interactionStore';
import { ComponentType, type MessageComponent } from '@discordy/core/contracts/rest';
import { attempt } from '../../app/actions';
import { getRuntime } from '../../app/runtime';
import { Button } from '../../shared/ui/Button';
import { Field, Input, TextArea } from '../../shared/ui/Form';
import { Modal } from '../../shared/ui/Modal';

const PARAGRAPH = 2;

function textInputs(components: MessageComponent[]): MessageComponent[] {
  return components.flatMap((c) => (c.type === ComponentType.ACTION_ROW ? textInputs(c.components ?? []) : c.type === ComponentType.TEXT_INPUT ? [c] : []));
}

/** Renders the modal an application opened in response to an interaction; submitting sends a modal-submit interaction. */
export function InteractionModal() {
  const modal = useInteractionStore((s) => s.modal);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const inputs = modal ? textInputs(modal.components) : [];

  useEffect(() => {
    setValues(Object.fromEntries(inputs.map((i) => [i.custom_id ?? '', i.value ?? ''])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modal?.interactionId]);

  if (!modal) return null;
  const close = () => useInteractionStore.getState().closeModal();
  const missing = inputs.some((i) => (i.required ?? true) && !(values[i.custom_id ?? ''] ?? '').trim());

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (missing) return;
    setBusy(true);
    await attempt(() => getRuntime().interactions.submitModal(values), 'Could not submit form');
    setBusy(false);
  };

  return (
    <Modal
      open
      title={modal.title}
      onClose={close}
      footer={
        <>
          <Button variant="ghost" onClick={close}>Cancel</Button>
          <Button variant="primary" type="submit" form="interaction-modal-form" loading={busy} disabled={missing}>Submit</Button>
        </>
      }
    >
      <form id="interaction-modal-form" className="interaction-modal" onSubmit={(e) => void submit(e)}>
        {inputs.map((input, i) => {
          const id = input.custom_id ?? '';
          const common = {
            value: values[id] ?? '',
            placeholder: input.placeholder,
            maxLength: input.max_length,
            minLength: input.min_length,
            required: input.required ?? true,
            onChange: (e: { target: { value: string } }) => setValues((v) => ({ ...v, [id]: e.target.value })),
          };
          return (
            <Field key={id} label={input.label ?? id}>
              {(fieldId) =>
                input.style === PARAGRAPH ? (
                  <TextArea id={fieldId} rows={4} data-autofocus={i === 0 ? '' : undefined} {...common} />
                ) : (
                  <Input id={fieldId} data-autofocus={i === 0 ? '' : undefined} {...common} />
                )
              }
            </Field>
          );
        })}
      </form>
    </Modal>
  );
}
