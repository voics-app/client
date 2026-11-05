import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { activeCustomStatus, CUSTOM_STATUS_MAX, EXPIRY_CHOICES, expiryFor, type ExpiryChoice } from '@discordy/core/domain/selfPresence';
import { Button, Choices, Field } from '../ui/controls';
import { setCustomStatus } from './presence';

/** The custom status editor: text, when it clears, Save and Clear. Used by the Profile page and the status sheet of the user panel. */
export function CustomStatusForm({ onDone }: { onDone?: () => void }) {
  const stored = useSessionStore((s) => s.settings.custom_status);
  const active = activeCustomStatus(stored, Date.now());
  const [text, setText] = useState(active?.text ?? '');
  const [expiry, setExpiry] = useState<ExpiryChoice>('never');
  return (
    <View>
      <Field label="Custom status" value={text} maxLength={CUSTOM_STATUS_MAX} autoCapitalize="sentences" onChangeText={setText} />
      <Choices<ExpiryChoice> label="Clear after" options={EXPIRY_CHOICES.map((c) => ({ value: c.id, label: c.label }))} value={expiry} onChange={setExpiry} />
      <View style={styles.actions}>
        <Button label="Save status" tone="primary" onPress={() => void setCustomStatus(text, expiryFor(expiry, new Date())).then(() => onDone?.())} />
        {active && (
          <Button
            label="Clear status"
            onPress={() => {
              setText('');
              void setCustomStatus('', null).then(() => onDone?.());
            }}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { gap: 8, paddingVertical: 8 },
});
