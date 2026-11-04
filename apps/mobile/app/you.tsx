import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { usePrefsStore } from '@discordy/core/application/stores/prefsStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { Avatar } from '../src/profile/Avatar';
import { getRuntime } from '../src/runtime';
import { theme } from '../src/theme';

export default function YouScreen() {
  const user = useSessionStore((s) => s.user);
  const showReactions = usePrefsStore((s) => s.showReactions);
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
      {user && (
        <View style={styles.account}>
          <Avatar user={user} size={72} />
          <Text style={styles.name}>{user.global_name ?? user.username}</Text>
          <Text style={styles.handle}>{user.username}</Text>
          {user.email && <Text style={styles.handle}>{user.email}</Text>}
        </View>
      )}
      <View style={styles.setting}>
        <Text style={styles.settingLabel}>Show reactions under messages</Text>
        <Switch accessibilityLabel="Show reactions under messages" value={showReactions} onValueChange={(value) => usePrefsStore.getState().set('showReactions', value)} />
      </View>
      <Pressable accessibilityRole="button" disabled={busy} onPress={signOut} style={styles.button}>
        {busy ? <ActivityIndicator color={theme.text} /> : <Text style={styles.buttonText}>Sign out</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background, padding: 24 },
  account: { alignItems: 'center', marginTop: 16 },
  name: { color: theme.text, fontSize: 22, fontWeight: '700', marginTop: 12 },
  handle: { color: theme.muted, marginTop: 4 },
  setting: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 32, backgroundColor: theme.raised, borderRadius: 8, padding: 14 },
  settingLabel: { color: theme.text, fontSize: 15, flexShrink: 1 },
  button: { backgroundColor: theme.raised, borderRadius: 8, paddingVertical: 14, alignItems: 'center', marginTop: 24 },
  buttonText: { color: theme.danger, fontSize: 16, fontWeight: '700' },
});
