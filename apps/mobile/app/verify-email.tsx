import { useLocalSearchParams } from 'expo-router';
import { VerifyEmailScreen } from '../src/signIn/VerifyEmailScreen';
import { getRuntime } from '../src/runtime';

/** `voics://verify-email?token=...` from the verification email. */
export default function VerifyEmail() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  return <VerifyEmailScreen api={getRuntime().api} token={token} />;
}
