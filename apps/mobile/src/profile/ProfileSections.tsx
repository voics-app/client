import { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { saveUserNote } from '@discordy/core/application/notificationSync';
import { useUserNotesStore } from '@discordy/core/application/stores/notificationSettingsStore';
import type { User } from '@discordy/core/contracts/rest';
import { getRuntime } from '../runtime';
import { theme } from '../theme';
import { attempt } from '../ui/attempt';
import { Avatar } from './Avatar';
import type { MutualServer } from './profileModel';

export const NOTE_MAX_LENGTH = 256;

/** A small caption and its value, as in a profile card. */
export function ProfileField({ label, children }: { label: string; children: string }) {
  return (
    <>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{children}</Text>
    </>
  );
}

/** The private note about a person (only you see it). It saves when the field loses focus, and the text goes back if saving fails. */
export function ProfileNote({ userId }: { userId: string }) {
  const saved = useUserNotesStore((s) => s.byUser[userId] ?? '');
  const [draft, setDraft] = useState(saved);
  useEffect(() => setDraft(saved), [saved]);
  return (
    <>
      <Text style={styles.label}>Note</Text>
      <TextInput
        accessibilityLabel="Note"
        value={draft}
        onChangeText={setDraft}
        onBlur={() => {
          const text = draft.trim();
          if (text === saved) return;
          void attempt(() => saveUserNote(getRuntime().api, userId, text), 'Could not save the note').then((ok) => ok === undefined && setDraft(saved));
        }}
        multiline
        maxLength={NOTE_MAX_LENGTH}
        placeholder="Add a note (only visible to you)"
        placeholderTextColor={theme.subtle}
        style={styles.note}
      />
    </>
  );
}

export function MutualServers({ servers }: { servers: readonly MutualServer[] }) {
  return (
    <View accessibilityLabel="Mutual servers">
      <Text style={styles.label}>{`Mutual servers - ${servers.length}`}</Text>
      {servers.length === 0 ? (
        <Text style={styles.value}>No servers in common.</Text>
      ) : (
        servers.map((s) => (
          <Text key={s.id} style={styles.value}>
            {s.name}
            {s.nick ? <Text style={styles.muted}>{` as ${s.nick}`}</Text> : null}
          </Text>
        ))
      )}
    </View>
  );
}

export function MutualFriends({ friends }: { friends: readonly User[] }) {
  return (
    <View accessibilityLabel="Mutual friends">
      <Text style={styles.label}>{`Mutual friends - ${friends.length}`}</Text>
      {friends.length === 0 ? (
        <Text style={styles.value}>No friends in common.</Text>
      ) : (
        friends.map((f) => (
          <View key={f.id} style={styles.friend}>
            <Avatar user={f} size={24} />
            <Text style={styles.friendName}>{f.global_name || f.username}</Text>
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { color: theme.muted, fontSize: 12, fontWeight: '700', marginTop: 16, textTransform: 'uppercase' },
  value: { color: theme.text, fontSize: 15, marginTop: 4 },
  muted: { color: theme.subtle },
  note: { color: theme.text, fontSize: 15, marginTop: 6, minHeight: 44, maxHeight: 120, borderRadius: 10, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 10, backgroundColor: theme.raised },
  friend: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 36, marginTop: 4 },
  friendName: { color: theme.text, fontSize: 15 },
});
