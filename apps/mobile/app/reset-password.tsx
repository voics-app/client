import { useLocalSearchParams } from 'expo-router';
import { parseAuthToken } from '@discordy/core/domain/authLinks';
import { SignInScreen } from '../src/signIn/SignInScreen';
import { getRuntime } from '../src/runtime';

/** `voics://reset-password?token=...` from the password-reset email: the new-password form with the token filled in. A malformed token opens the form empty, to paste the code from the email. */
export default function ResetPassword() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const { session, api } = getRuntime();
  const valid = parseAuthToken(token);
  return <SignInScreen session={session} api={api} initialMode="reset" {...(valid ? { initialToken: valid } : {})} />;
}
