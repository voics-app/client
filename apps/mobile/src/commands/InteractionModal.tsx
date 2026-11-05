import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { errorMessage } from '@discordy/core/application/errorMessage';
import { useInteractionStore } from '@discordy/core/application/stores/interactionStore';
import { modalInitialValues, modalInputs, modalReady } from '@discordy/core/domain/slashCommand';
import { getRuntime } from '../runtime';
import { BottomSheet } from '../sheets/BottomSheet';
import { useLastValue } from '../sheets/useLastValue';
import { theme } from '../theme';
import { Button, Field } from '../ui/controls';

const PARAGRAPH = 2;

/** The form an application opened in answer to a command or a button; Submit sends it back as a modal-submit interaction. Mounted once, at the root. */
export function InteractionModal() {
  const current = useInteractionStore((s) => s.modal);
  const modal = useLastValue(current);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const inputs = modal ? modalInputs(modal.components) : [];

  useEffect(() => {
    if (current) setValues(modalInitialValues(modalInputs(current.components)));
  }, [current?.interactionId]); // eslint-disable-line react-hooks/exhaustive-deps

  const close = () => useInteractionStore.getState().closeModal();
  const submit = async () => {
    setBusy(true);
    try {
      await getRuntime().interactions.submitModal(values);
    } catch (error) {
      Alert.alert('Could not submit form', errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet visible={current !== null} onClose={close} label={modal?.title ?? 'Form'} closeLabel="Close form" tall>
      {modal && (
        <>
          <Text accessibilityRole="header" style={styles.title}>
            {modal.title}
          </Text>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.form}>
            {inputs.map((input) => {
              const id = input.custom_id ?? '';
              return (
                <Field
                  key={id}
                  label={input.label ?? id}
                  value={values[id] ?? ''}
                  placeholder={input.placeholder}
                  multiline={input.style === PARAGRAPH}
                  autoCapitalize="sentences"
                  {...(input.max_length !== undefined ? { maxLength: input.max_length } : {})}
                  onChangeText={(text) => setValues((v) => ({ ...v, [id]: text }))}
                />
              );
            })}
          </ScrollView>
          <View style={styles.actions}>
            <Button label="Submit" tone="primary" busy={busy} disabled={!modalReady(inputs, values)} onPress={() => void submit()} />
            <Button label="Cancel" onPress={close} />
          </View>
        </>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  title: { color: theme.text, fontSize: 17, fontWeight: '700', paddingHorizontal: 20, paddingBottom: 8 },
  form: { paddingHorizontal: 20 },
  actions: { gap: 8, paddingHorizontal: 20, paddingTop: 8 },
});
