import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import type { User } from '@discordy/core/contracts/rest';
import { getRuntime } from '../../runtime';
import { useLastValue } from '../../sheets/useLastValue';
import { theme } from '../../theme';
import { Button, Field } from '../../ui/controls';
import { Sheet } from '../../ui/Sheet';
import { CREDENTIAL_COPY, credentialChange, credentialField, type CredentialKind } from './accountModel';
import { useAction } from './useAction';

function Body({ kind, user, onClose }: { kind: CredentialKind; user: User; onClose(): void }) {
  const [value, setValue] = useState(kind === 'username' ? user.username : '');
  const [confirmation, setConfirmation] = useState('');
  const [password, setPassword] = useState('');
  const [done, setDone] = useState<string | null>(null);
  const { busy, error, setError, run } = useAction();
  const copy = CREDENTIAL_COPY[kind];

  const submit = () => {
    const built = credentialChange(kind, value, confirmation, password);
    if ('problem' in built) return setError(built.problem);
    void run(async () => {
      const updated = await getRuntime().api.changeAccount(built.change);
      useSessionStore.getState().setUser(updated);
      if (kind === 'email') setDone(`We sent a verification code to ${value.trim()}. Your email changes once you verify it.`);
      else onClose();
    }, credentialField(kind));
  };

  if (done) {
    return (
      <View style={styles.body}>
        <Text accessibilityRole="alert" style={styles.note}>
          {done}
        </Text>
        <Button label="Done" tone="primary" onPress={onClose} />
      </View>
    );
  }
  return (
    <View style={styles.body}>
      <Field label={copy.label} value={value} onChangeText={setValue} autoFocus keyboardType={kind === 'email' ? 'email-address' : 'default'} secureTextEntry={kind === 'password'} autoComplete={kind === 'password' ? 'new-password' : 'off'} />
      {kind === 'password' && <Field label="Confirm new password" value={confirmation} onChangeText={setConfirmation} secureTextEntry autoComplete="new-password" />}
      <Field label="Current password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" />
      {kind === 'password' && <Text style={styles.note}>Your other sessions are signed out.</Text>}
      {error && (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      )}
      <Button label={copy.button} tone="primary" busy={busy} disabled={!value || !password} onPress={submit} />
    </View>
  );
}

/** Change username, email or password: the same fields, checks and password confirmation as desktop's dialogs. */
export function CredentialSheet({ kind: shown, user, onClose }: { kind: CredentialKind | null; user: User; onClose(): void }) {
  const kind = useLastValue(shown);
  return (
    <Sheet visible={shown !== null} title={kind ? CREDENTIAL_COPY[kind].title : ''} closeLabel="Close" onClose={onClose}>
      {shown && <Body key={shown} kind={shown} user={user} onClose={onClose} />}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 20, paddingBottom: 8 },
  note: { color: theme.muted, fontSize: 14, marginBottom: 12 },
  error: { color: theme.danger, fontSize: 14, marginBottom: 12 },
});
