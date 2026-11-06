import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { errorMessage } from '@discordy/core/application/errorMessage';
import type { ApiPort } from '@discordy/core/application/ports/api';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { parseAuthToken } from '@discordy/core/domain/authLinks';
import { space, theme } from '../theme';
import { Button } from '../ui/controls';

type State = { kind: 'checking' } | { kind: 'done' } | { kind: 'failed'; message: string };

/** Confirms the email address with the token from the link, then says so; signed in or not, the call needs no session. */
export function VerifyEmailScreen({ api, token }: { api: Pick<ApiPort, 'verifyEmail'>; token: string | undefined }) {
  const valid = parseAuthToken(token);
  const [state, setState] = useState<State>(valid ? { kind: 'checking' } : { kind: 'failed', message: 'This link is not valid. Open the latest verification email and tap the link again.' });
  const signedIn = useSessionStore((s) => s.status === 'ready' || s.status === 'connecting');

  useEffect(() => {
    if (!valid) return;
    let alive = true;
    api
      .verifyEmail(valid)
      .then(() => alive && setState({ kind: 'done' }))
      .catch((err: unknown) => alive && setState({ kind: 'failed', message: errorMessage(err) }));
    return () => {
      alive = false;
    };
  }, [api, valid]);

  return (
    <View style={styles.container}>
      {state.kind === 'checking' && (
        <>
          <ActivityIndicator color={theme.muted} />
          <Text style={styles.text}>Verifying your email address...</Text>
        </>
      )}
      {state.kind === 'done' && <Text style={styles.heading}>Email verified</Text>}
      {state.kind === 'failed' && (
        <Text style={styles.error} accessibilityRole="alert">
          {state.message}
        </Text>
      )}
      {state.kind !== 'checking' && <Button label={signedIn ? 'Continue' : 'Go to sign in'} tone="primary" onPress={() => router.replace(signedIn ? '/' : '/sign-in')} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space[4], padding: space[5], backgroundColor: theme.background },
  heading: { color: theme.text, fontSize: 22, fontWeight: '700' },
  text: { color: theme.muted, fontSize: 15 },
  error: { color: theme.danger, fontSize: 15, textAlign: 'center' },
});
