import { Redirect } from 'expo-router';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';

export default function Index() {
  const status = useSessionStore((s) => s.status);
  return <Redirect href={status === 'connecting' || status === 'ready' ? '/servers' : '/sign-in'} />;
}
