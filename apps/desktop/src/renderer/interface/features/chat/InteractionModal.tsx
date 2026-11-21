import { useI18n } from '../../shared/i18n';
import { useEffect, useState, type FormEvent } from 'react';
import { useInteractionStore } from '@discordy/core/application/stores/interactionStore';
import { modalInitialValues, modalInputs, modalReady } from '@discordy/core/domain/slashCommand';
import { attempt } from '../../app/actions';
import { getRuntime } from '../../app/runtime';
import { Button } from '../../shared/ui/Button';
import { Field, Input, TextArea } from '../../shared/ui/Form';
import { Modal } from '../../shared/ui/Modal';
import { useChannelContentAccess } from '../../shared/hooks/useChannelContentAccess';
import { AgeRestrictedGate } from '../channels/AgeRestrictedGate';

const PARAGRAPH = 2;

/** Renders the modal an application opened in response to an interaction; submitting sends a modal-submit interaction. */
export function InteractionModal() {
  const { canShow } = useChannelContentAccess();
  const { t: msg } = useI18n();
  const modal = useInteractionStore((s) => s.modal);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const inputs = modal ? modalInputs(modal.components) : [];

  useEffect(() => {
    setValues(modalInitialValues(inputs));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modal?.interactionId]);

  if (!modal) return null;
  const close = () => useInteractionStore.getState().closeModal();
  if (!canShow(modal.channelId)) return <Modal open onClose={close} title={msg('age.title')}><AgeRestrictedGate channelId={modal.channelId} onExit={close}>{null}</AgeRestrictedGate></Modal>;
  const missing = !modalReady(inputs, values);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (missing) return;
    setBusy(true);
    await attempt(() => getRuntime().interactions.submitModal(values), msg("settings.interactionmodal.could.not.submit.form"));
    setBusy(false);
  };

  return (
    <Modal
      open
      title={modal.title}
      onClose={close}
      footer={
        <>
          <Button variant="ghost" onClick={close}>{msg("common.cancel")}</Button>
          <Button variant="primary" type="submit" form="interaction-modal-form" loading={busy} disabled={missing}>{msg("settings.interactionmodal.submit")}</Button>
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
