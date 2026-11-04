import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { getRuntime } from '../../src/runtime';
import { theme } from '../../src/theme';

export default function YouScreen() {
  const user = useSessionStore((s) => s.user);
  const [busy, setBusy] = useState(false);

  const signOut = async () => {
    setBusy(true);
    try {
      await getRuntime().session.logout();
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.name}>{user ? (user.global_name ?? user.username) : ''}</Text>
      {user && <Text style={styles.handle}>{user.username}</Text>}
      <Pressable accessibilityRole="button" disabled={busy} onPress={signOut} style={styles.button}>
        {busy ? <ActivityIndicator color={theme.text} /> : <Text style={styles.buttonText}>Sign out</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.background, padding: 24 },
  name: { color: theme.text, fontSize: 22, fontWeight: '700' },
  handle: { color: theme.muted, marginTop: 4 },
  button: { backgroundColor: theme.surface, borderRadius: 8, paddingVertical: 14, paddingHorizontal: 32, marginTop: 32 },
  buttonText: { color: theme.danger, fontSize: 16, fontWeight: '700' },
});
