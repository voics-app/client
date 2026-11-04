import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput } from 'react-native';
import type { SessionManager } from '@discordy/core/application/sessionManager';
import { BRAND } from '../brand';
import { theme } from '../theme';
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
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
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
          <TextInput
            style={styles.input}
            accessibilityLabel="Authenticator or backup code"
            placeholder="Code"
            placeholderTextColor={theme.muted}
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
          <TextInput
            style={styles.input}
            accessibilityLabel="Email"
            placeholder="Email"
            placeholderTextColor={theme.muted}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            autoComplete="email"
            textContentType="username"
          />
          {fields.email && <Text style={styles.fieldError}>{fields.email}</Text>}
          <TextInput
            style={styles.input}
            accessibilityLabel="Password"
            placeholder="Password"
            placeholderTextColor={theme.muted}
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
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !canSubmit }}
        disabled={!canSubmit}
        onPress={submit}
        style={[styles.button, !canSubmit && styles.buttonDisabled]}
      >
        {busy ? <ActivityIndicator color={theme.text} /> : <Text style={styles.buttonText}>{ticket ? 'Verify' : 'Sign in'}</Text>}
      </Pressable>
      {ticket && (
        <Pressable accessibilityRole="button" onPress={back} style={styles.linkButton}>
          <Text style={styles.link}>Back</Text>
        </Pressable>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', backgroundColor: theme.background, padding: 24 },
  title: { color: theme.text, fontSize: 32, fontWeight: '800', textAlign: 'center' },
  heading: { color: theme.text, fontSize: 20, fontWeight: '700', marginTop: 24, marginBottom: 16 },
  hint: { color: theme.muted, marginBottom: 12 },
  error: { color: theme.danger, marginBottom: 12 },
  fieldError: { color: theme.danger, marginTop: -8, marginBottom: 12 },
  input: { backgroundColor: theme.surface, color: theme.text, borderRadius: 8, padding: 14, fontSize: 16, marginBottom: 12 },
  button: { backgroundColor: theme.accent, borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 4 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: theme.text, fontSize: 16, fontWeight: '700' },
  linkButton: { alignItems: 'center', marginTop: 16 },
  link: { color: theme.accent, fontSize: 16 },
});
