import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useRelationshipStore } from '@discordy/core/application/stores/peopleStores';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import type { User } from '@discordy/core/contracts/rest';
import { getRuntime } from '../runtime';
import { theme } from '../theme';
import { attempt } from '../ui/attempt';
import { Avatar } from './Avatar';
import { profileView } from './profileModel';

/** Bottom sheet with one person's profile: avatar, names, About me, for friends since when, in a server their roles and when they joined, and a Message button that opens the DM (not shown for yourself). */
export function ProfileSheet({ user, guildId, onClose }: { user: User | null; guildId?: string; onClose(): void }) {
  const relationship = useRelationshipStore((s) => (user ? s.byUser[user.id] : undefined));
  const guild = useGuildStore((s) => (guildId ? s.guilds[guildId] : undefined));
  const member = useGuildStore((s) => (guildId && user ? s.members[guildId]?.[user.id] : undefined));
  const me = useSessionStore((s) => s.user?.id);
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

  const message = async () => {
    if (!user) return;
    const channel = await attempt(() => getRuntime().api.openPrivateChannel([user.id]), 'Could not open conversation');
    if (!channel) return;
    useGuildStore.getState().upsertChannel(channel);
    onClose();
    router.push(`/dms/${channel.id}`);
  };

  const view = user ? profileView(user, relationship, fetched?.id === user.id ? fetched.bio : undefined, guild && member ? { roles: guild.roles, member } : undefined) : null;
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
          {view.roles.length > 0 && (
            <>
              <Text style={styles.label}>Roles</Text>
              <Text style={styles.value}>{view.roles.join(', ')}</Text>
            </>
          )}
          {view.memberSince && (
            <>
              <Text style={styles.label}>Member since</Text>
              <Text style={styles.value}>{view.memberSince.toLocaleDateString()}</Text>
            </>
          )}
          {view.friendsSince && (
            <>
              <Text style={styles.label}>Friends since</Text>
              <Text style={styles.value}>{view.friendsSince.toLocaleDateString()}</Text>
            </>
          )}
          {user.id !== me && (
            <Pressable accessibilityRole="button" accessibilityLabel="Message" onPress={() => void message()} style={styles.message}>
              <Text style={styles.messageText}>Message</Text>
            </Pressable>
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
  message: { alignItems: 'center', marginTop: 20, paddingVertical: 12, borderRadius: 10, backgroundColor: theme.accent },
  messageText: { color: theme.accentText, fontSize: 16, fontWeight: '600' },
  close: { alignItems: 'center', marginTop: 8, paddingVertical: 12 },
  closeText: { color: theme.accent, fontSize: 16, fontWeight: '600' },
});
