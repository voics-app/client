import { SignInScreen } from '../src/signIn/SignInScreen';
import { getRuntime } from '../src/runtime';

export default function SignIn() {
  return <SignInScreen session={getRuntime().session} />;
}
