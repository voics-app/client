import Constants from 'expo-constants';
import { Redirect } from 'expo-router';
import { SignInScreen } from '../src/signIn/SignInScreen';
import { getRuntime } from '../src/runtime';

export default function SignIn() {
  if (Constants.expoConfig?.extra?.voiceFixture) return <Redirect href="/voice-qa" />;
  const { session, api } = getRuntime();
  return <SignInScreen session={session} api={api} />;
}
