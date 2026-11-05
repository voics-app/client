import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import type { SessionManager } from '@discordy/core/application/sessionManager';
import { BRAND } from '../brand';
import { radius, space, theme } from '../theme';
import { Button, Input } from '../ui/controls';
import { interpretSignInError } from './signInOutcome';

export type SignInSession = Pick<SessionManager, 'login' | 'loginMfa'>;

/** Email and password, then the authenticator or backup code when the account has two-factor sign-in. */
export function SignInScreen({ session }: { session: SignInSession }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [ticket, setTicket] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  const canSubmit = !busy && (ticket ? code.trim() !== '' : email.trim() !== '' && password !== '');

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    setFields({});
    try {
      if (ticket) await session.loginMfa({ ticket, code: code.trim() });
      else await session.login({ email: email.trim(), password });
    } catch (err) {
      const outcome = interpretSignInError(err);
      if (outcome.kind === 'mfa') setTicket(outcome.ticket);
      else {
        setError(outcome.message);
        setFields(outcome.fields);
      }
    } finally {
      setBusy(false);
    }
  };

  const back = () => {
    setTicket(null);
    setCode('');
    setError(null);
    setFields({});
  };

  return (
    <KeyboardAwareScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled" bottomOffset={24}>
      <View style={styles.mark}>
        <Text style={styles.markText}>{BRAND.displayName.slice(0, 1)}</Text>
      </View>
      <Text style={styles.title}>{BRAND.displayName}</Text>
      <Text style={styles.heading}>{ticket ? 'Two-factor authentication' : 'Welcome back'}</Text>
      {error && (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      )}
      {ticket ? (
        <>
          <Text style={styles.hint}>Open your authenticator app, or enter one of your backup codes.</Text>
          <Input
            style={styles.input}
            accessibilityLabel="Authenticator or backup code"
            placeholder="Code"
                        value={code}
            onChangeText={setCode}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            onSubmitEditing={submit}
          />
          {fields.code && <Text style={styles.fieldError}>{fields.code}</Text>}
        </>
      ) : (
        <>
          <Input
            style={styles.input}
            accessibilityLabel="Email"
            placeholder="Email"
                        value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            autoComplete="email"
            textContentType="username"
          />
          {fields.email && <Text style={styles.fieldError}>{fields.email}</Text>}
          <Input
            style={styles.input}
            accessibilityLabel="Password"
            placeholder="Password"
                        value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="current-password"
            textContentType="password"
            onSubmitEditing={submit}
          />
          {fields.password && <Text style={styles.fieldError}>{fields.password}</Text>}
        </>
      )}
      <View style={styles.action}>
        <Button label={ticket ? 'Verify' : 'Sign in'} size="large" tone="primary" busy={busy} disabled={!canSubmit} onPress={submit} />
      </View>
      {ticket && (
        <Pressable accessibilityRole="button" onPress={back} style={styles.linkButton}>
          <Text style={styles.link}>Back</Text>
        </Pressable>
      )}
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', backgroundColor: theme.background, padding: space[5] },
  mark: { width: 72, height: 72, borderRadius: 22, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: space[3] },
  markText: { color: theme.accentText, fontSize: 38, fontWeight: '800' },
  title: { color: theme.text, fontSize: 30, fontWeight: '800', textAlign: 'center' },
  heading: { color: theme.text, fontSize: 20, fontWeight: '700', marginTop: space[5], marginBottom: space[4] },
  hint: { color: theme.muted, marginBottom: space[3], fontSize: 15 },
  error: { color: theme.danger, marginBottom: space[3] },
  fieldError: { color: theme.danger, marginTop: -8, marginBottom: space[3] },
  input: { minHeight: 52, borderRadius: radius.control + 2, fontSize: 16, marginBottom: space[3], backgroundColor: theme.surface },
  action: { marginTop: space[1] },
  linkButton: { alignItems: 'center', justifyContent: 'center', minHeight: 44, marginTop: space[3] },
  link: { color: theme.accent, fontSize: 16 },
});
