import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRelationshipStore } from '@discordy/core/application/stores/peopleStores';
import type { User } from '@discordy/core/contracts/rest';
import { getRuntime } from '../runtime';
import { theme } from '../theme';
import { Avatar } from './Avatar';
import { profileView } from './profileModel';

/** Bottom sheet with one person's profile: avatar, names, About me and, for friends, since when. */
export function ProfileSheet({ user, onClose }: { user: User | null; onClose(): void }) {
  const relationship = useRelationshipStore((s) => (user ? s.byUser[user.id] : undefined));
  const [fetched, setFetched] = useState<{ id: string; bio: string } | null>(null);

  useEffect(() => {
    if (!user) return;
    let current = true;
    getRuntime()
      .api.userProfile(user.id)
      .then((profile) => current && setFetched({ id: user.id, bio: profile.user.bio ?? '' }))
      // The cached user still shows; a failed refresh only means About me may be stale.
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [user]);

  const view = user ? profileView(user, relationship, fetched?.id === user.id ? fetched.bio : undefined) : null;
  return (
    <Modal visible={user !== null} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close profile" />
      {user && view && (
        <View style={styles.sheet}>
          <Avatar user={user} size={72} />
          <Text style={styles.name}>{view.name}</Text>
          <Text style={styles.username}>{view.username}</Text>
          {view.bio !== '' && (
            <>
              <Text style={styles.label}>About me</Text>
              <Text style={styles.value}>{view.bio}</Text>
            </>
          )}
          {view.friendsSince && (
            <>
              <Text style={styles.label}>Friends since</Text>
              <Text style={styles.value}>{view.friendsSince.toLocaleDateString()}</Text>
            </>
          )}
          <Pressable accessibilityRole="button" onPress={onClose} style={styles.close}>
            <Text style={styles.closeText}>Close</Text>
          </Pressable>
        </View>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#00000088' },
  sheet: { backgroundColor: theme.surface, padding: 20, paddingBottom: 32 },
  name: { color: theme.text, fontSize: 22, fontWeight: '700', marginTop: 12 },
  username: { color: theme.muted, marginTop: 2 },
  label: { color: theme.muted, fontSize: 12, fontWeight: '700', marginTop: 16, textTransform: 'uppercase' },
  value: { color: theme.text, fontSize: 15, marginTop: 4 },
  close: { alignItems: 'center', marginTop: 24, paddingVertical: 12 },
  closeText: { color: theme.accent, fontSize: 16, fontWeight: '600' },
});
