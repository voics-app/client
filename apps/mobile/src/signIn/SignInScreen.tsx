import { useState, type ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import type { ApiPort } from '@discordy/core/application/ports/api';
import type { SessionManager } from '@discordy/core/application/sessionManager';
import { BRAND } from '../brand';
import { radius, space, theme } from '../theme';
import { Button, Input } from '../ui/controls';
import { interpretSignInError } from './signInOutcome';

export type SignInSession = Pick<SessionManager, 'login' | 'loginMfa' | 'register'>;
/** The password-reset calls, the same ones the desktop sign-in screen makes. */
export type ResetApi = Pick<ApiPort, 'forgotPassword' | 'resetPassword'>;

export type AuthMode = 'login' | 'register' | 'forgot' | 'reset';

const HEADINGS: Record<AuthMode, string> = {
  login: 'Welcome back',
  register: 'Create your account',
  forgot: 'Forgot your password?',
  reset: 'Choose a new password',
};

const SUBMIT: Record<AuthMode, string> = {
  login: 'Sign in',
  register: 'Create account',
  forgot: 'Email me a reset code',
  reset: 'Change password',
};

export interface SignInScreenProps {
  session: SignInSession;
  api: ResetApi;
  /** Opens on this form; a reset-password link opens it on `reset`. */
  initialMode?: AuthMode;
  /** The token from a reset-password link, already filled in. */
  initialToken?: string;
}

/**
 * Sign in, create an account, ask for a password reset and choose the new password, as the desktop sign-in screen does,
 * and the authenticator or backup code when the account has two-factor sign-in.
 */
export function SignInScreen({ session, api, initialMode = 'login', initialToken = '' }: SignInScreenProps) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [resetToken, setResetToken] = useState(initialToken);
  const [ticket, setTicket] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(initialMode === 'reset' && initialToken ? 'Choose a new password.' : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  const canSubmit =
    !busy &&
    (ticket
      ? code.trim() !== ''
      : mode === 'forgot'
        ? email.trim() !== ''
        : mode === 'reset'
          ? resetToken.trim() !== '' && password !== ''
          : email.trim() !== '' && password !== '' && (mode !== 'register' || username.trim() !== ''));

  const go = (next: AuthMode) => {
    setMode(next);
    setTicket(null);
    setCode('');
    setError(null);
    setNotice(null);
    setFields({});
  };

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    setFields({});
    try {
      if (mode === 'forgot') {
        await api.forgotPassword(email.trim());
        go('reset');
        setNotice('If that address has an account, a reset code is on its way. Paste it below.');
      } else if (mode === 'reset') {
        await api.resetPassword(resetToken.trim(), password);
        setPassword('');
        setResetToken('');
        go('login');
        setNotice('Password changed. Sign in with the new one.');
      } else if (mode === 'login' && ticket) await session.loginMfa({ ticket, code: code.trim() });
      else if (mode === 'login') await session.login({ email: email.trim(), password });
      else await session.register({ email: email.trim(), username: username.trim(), password });
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

  const text = (label: string, value: string, onChange: (v: string) => void, extra: Partial<ComponentProps<typeof Input>> = {}, field?: string) => (
    <>
      <Input style={styles.input} accessibilityLabel={label} placeholder={label} value={value} onChangeText={onChange} autoCapitalize="none" autoCorrect={false} {...extra} />
      {field && fields[field] && <Text style={styles.fieldError}>{fields[field]}</Text>}
    </>
  );

  return (
    <KeyboardAwareScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled" bottomOffset={24}>
      <View style={styles.mark}>
        <Text style={styles.markText}>{BRAND.displayName.slice(0, 1)}</Text>
      </View>
      <Text style={styles.title}>{BRAND.displayName}</Text>
      <Text style={styles.heading}>{ticket ? 'Two-factor authentication' : HEADINGS[mode]}</Text>
      {notice && (
        <Text style={styles.notice} accessibilityLiveRegion="polite">
          {notice}
        </Text>
      )}
      {error && (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      )}
      {ticket ? (
        <>
          <Text style={styles.hint}>Open your authenticator app, or enter one of your backup codes.</Text>
          {text('Authenticator or backup code', code, setCode, { placeholder: 'Code', autoComplete: 'one-time-code', textContentType: 'oneTimeCode', onSubmitEditing: submit }, 'code')}
        </>
      ) : (
        <>
          {mode !== 'reset' &&
            text('Email', email, setEmail, { keyboardType: 'email-address', autoComplete: 'email', textContentType: mode === 'login' ? 'username' : 'emailAddress', ...(mode === 'forgot' ? { onSubmitEditing: submit } : {}) }, 'email')}
          {mode === 'reset' && (
            <>
              {text('Reset code', resetToken, setResetToken, { autoComplete: 'off', textContentType: 'oneTimeCode' }, 'token')}
              <Text style={styles.hint}>From the email we sent you.</Text>
            </>
          )}
          {mode === 'register' && text('Username', username, setUsername, { autoComplete: 'username-new', textContentType: 'username' }, 'username')}
          {mode === 'register' && <Text style={styles.hint}>Lowercase letters, numbers, dots and underscores.</Text>}
          {mode !== 'forgot' &&
            text(
              mode === 'reset' ? 'New password' : 'Password',
              password,
              setPassword,
              { secureTextEntry: true, autoComplete: mode === 'login' ? 'current-password' : 'new-password', textContentType: mode === 'login' ? 'password' : 'newPassword', onSubmitEditing: submit },
              'password',
            )}
          {(mode === 'register' || mode === 'reset') && <Text style={styles.hint}>At least 8 characters.</Text>}
        </>
      )}
      <View style={styles.action}>
        <Button label={ticket ? 'Verify' : SUBMIT[mode]} size="large" tone="primary" busy={busy} disabled={!canSubmit} onPress={submit} />
      </View>
      {ticket && <LinkButton label="Back" onPress={() => go('login')} />}
      {!ticket && mode === 'login' && <LinkButton label="Forgot password?" onPress={() => go('forgot')} />}
      {!ticket && mode === 'login' && <LinkButton label="New here? Create an account" onPress={() => go('register')} />}
      {!ticket && mode === 'register' && <LinkButton label="Have an account? Sign in" onPress={() => go('login')} />}
      {!ticket && (mode === 'forgot' || mode === 'reset') && <LinkButton label="Back to sign in" onPress={() => go('login')} />}
    </KeyboardAwareScrollView>
  );
}

function LinkButton({ label, onPress }: { label: string; onPress(): void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.linkButton}>
      <Text style={styles.link}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', backgroundColor: theme.background, padding: space[5] },
  mark: { width: 72, height: 72, borderRadius: 22, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: space[3] },
  markText: { color: theme.accentText, fontSize: 38, fontWeight: '800' },
  title: { color: theme.text, fontSize: 30, fontWeight: '800', textAlign: 'center' },
  heading: { color: theme.text, fontSize: 20, fontWeight: '700', marginTop: space[5], marginBottom: space[4] },
  hint: { color: theme.muted, marginTop: -4, marginBottom: space[3], fontSize: 14 },
  notice: { color: theme.success, marginBottom: space[3], fontSize: 15 },
  error: { color: theme.danger, marginBottom: space[3] },
  fieldError: { color: theme.danger, marginTop: -8, marginBottom: space[3] },
  input: { minHeight: 52, borderRadius: radius.control + 2, fontSize: 16, marginBottom: space[3], backgroundColor: theme.surface },
  action: { marginTop: space[1] },
  linkButton: { alignItems: 'center', justifyContent: 'center', minHeight: 44, marginTop: space[2] },
  link: { color: theme.accent, fontSize: 16 },
});
