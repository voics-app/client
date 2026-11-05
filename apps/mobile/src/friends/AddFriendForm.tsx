import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BRAND } from '../brand';
import { theme } from '../theme';
import { Button, Field } from '../ui/controls';
import { sendFriendRequest, type FriendRequestResult } from './friendActions';

/** Desktop's Add friend page: a username and a Send request button; the line under it says what happened. */
export function AddFriendForm() {
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<FriendRequestResult | null>(null);
  const ready = username.trim().length >= 2;

  const submit = async () => {
    setBusy(true);
    const outcome = await sendFriendRequest(username);
    setBusy(false);
    setResult(outcome);
    if (outcome.ok) setUsername('');
  };

  return (
    <View style={styles.form}>
      <Text style={styles.hint}>{`You can add people with their ${BRAND.displayName} username.`}</Text>
      <Field label="Username" value={username} onChangeText={setUsername} placeholder="Enter a username" returnKeyType="send" onSubmitEditing={() => ready && !busy && void submit()} />
      <Button label="Send request" tone="primary" busy={busy} disabled={!ready} onPress={() => void submit()} />
      {result && (
        <Text accessibilityRole="alert" style={[styles.result, result.ok ? styles.ok : styles.bad]}>
          {result.text}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  form: { padding: 16 },
  hint: { color: theme.muted, fontSize: 15, marginBottom: 16 },
  result: { marginTop: 12, fontSize: 14 },
  ok: { color: theme.success },
  bad: { color: theme.danger },
});
