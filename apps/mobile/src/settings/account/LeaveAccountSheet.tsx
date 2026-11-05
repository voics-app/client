import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { User } from '@discordy/core/contracts/rest';
import { getRuntime } from '../../runtime';
import { theme } from '../../theme';
import { Button, Field } from '../../ui/controls';
import { Sheet } from '../../ui/Sheet';
import { canLeaveAccount } from './accountModel';
import { useAction } from './useAction';

export type LeaveMode = 'disable' | 'delete';

const COPY: Record<LeaveMode, { title: string; body: string; button: string }> = {
  delete: { title: 'Delete your account', body: 'Your account is removed after 14 days. Signing in again before then cancels it. You must hand over any servers you own first.', button: 'Delete account' },
  disable: { title: 'Disable your account', body: 'You are signed out everywhere. Signing in again turns your account back on.', button: 'Disable account' },
};

function Body({ mode, user, onClose }: { mode: LeaveMode; user: User; onClose(): void }) {
  const [password, setPassword] = useState('');
  const [typed, setTyped] = useState('');
  const { busy, error, run } = useAction();
  const copy = COPY[mode];
  const leave = () =>
    void run(async () => {
      const api = getRuntime().api;
      if (mode === 'delete') await api.deleteAccount(password);
      else await api.disableAccount(password);
      onClose();
      await getRuntime().session.logout();
    });
  return (
    <View style={styles.body}>
      <Text style={styles.text}>{copy.body}</Text>
      {mode === 'delete' && <Field label={`Type ${user.username} to confirm`} value={typed} onChangeText={setTyped} autoComplete="off" />}
      <Field label="Current password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" />
      {error && (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      )}
      <Button label={copy.button} tone="danger" busy={busy} disabled={!canLeaveAccount(mode, typed, user.username, password)} onPress={leave} />
    </View>
  );
}

/** Disable or delete the account: the password, and for deletion the username typed back, exactly as desktop asks. */
export function LeaveAccountSheet({ mode, user, onClose }: { mode: LeaveMode | null; user: User; onClose(): void }) {
  return (
    <Sheet visible={mode !== null} title={COPY[mode ?? 'disable'].title} closeLabel="Close" onClose={onClose}>
      {mode && <Body key={mode} mode={mode} user={user} onClose={onClose} />}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 20, paddingBottom: 8 },
  text: { color: theme.muted, fontSize: 14, marginBottom: 12 },
  error: { color: theme.danger, fontSize: 14, marginBottom: 12 },
});
