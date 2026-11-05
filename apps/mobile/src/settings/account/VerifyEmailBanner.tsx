import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import type { User } from '@discordy/core/contracts/rest';
import { getRuntime } from '../../runtime';
import { theme } from '../../theme';
import { Button, Field } from '../../ui/controls';
import { useAction } from './useAction';

/** Shown while the account's email is not verified: enter the code from the email, or ask for a new one. */
export function VerifyEmailBanner({ user }: { user: User }) {
  const [token, setToken] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const { busy, error, run } = useAction();
  if (!user.email || user.verified !== false) return null;
  const api = getRuntime().api;
  return (
    <View accessibilityLabel="Verify your email" style={styles.banner}>
      <Text style={styles.title}>{`Verify ${user.email}`}</Text>
      <Text style={styles.text}>Check your inbox for the code, or ask for a new one.</Text>
      <Field label="Verification code" value={token} onChangeText={setToken} placeholder="Code from the email" />
      <View style={styles.actions}>
        <Button
          label="Verify"
          tone="primary"
          busy={busy}
          disabled={!token.trim()}
          onPress={() =>
            void run(async () => {
              await api.verifyEmail(token.trim());
              useSessionStore.getState().setUser(await api.me());
              setToken('');
            }, 'token')
          }
        />
        <Button
          label="Resend"
          disabled={busy}
          onPress={() =>
            void run(async () => {
              await api.resendVerification();
              setMessage('Sent. It can take a minute.');
            }, 'email')
          }
        />
      </View>
      {message && !error && <Text style={styles.text}>{message}</Text>}
      {error && (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { margin: 16, padding: 14, borderRadius: 14, backgroundColor: theme.raised, borderWidth: 1, borderColor: theme.hairlineStrong },
  title: { color: theme.text, fontSize: 15, fontWeight: '700' },
  text: { color: theme.muted, fontSize: 13, marginVertical: 6 },
  actions: { flexDirection: 'row', gap: 8 },
  error: { color: theme.danger, fontSize: 13, marginTop: 8 },
});
