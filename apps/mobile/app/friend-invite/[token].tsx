import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { isFriendInviteToken, useFriendInviteStore } from '../../src/friends/friendInviteStore';
import { theme } from '../../src/theme';
import { Button } from '../../src/ui/controls';

export default function FriendInviteRoute() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const status = useSessionStore((s) => s.status);
  const valid = typeof token === 'string' && isFriendInviteToken(token);
  useEffect(() => { useFriendInviteStore.getState().set(valid ? token : null); }, [valid, token]);
  return <View style={styles.page}>
    <Text style={styles.text}>{valid ? 'Sign in to send this friend request.' : 'This friend invite is invalid.'}</Text>
    {valid && status !== 'ready' && <Button label="Sign in" tone="primary" onPress={() => router.push('/sign-in')} />}
  </View>;
}
const styles = StyleSheet.create({ page: { flex: 1, padding: 20, backgroundColor: theme.background }, text: { color: theme.text, fontSize: 16, marginBottom: 16 } });
