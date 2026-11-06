import { SignInScreen } from '../src/signIn/SignInScreen';
import { getRuntime } from '../src/runtime';

export default function SignIn() {
  const { session, api } = getRuntime();
  return <SignInScreen session={session} api={api} />;
}
