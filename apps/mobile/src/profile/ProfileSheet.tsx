import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useGuildPermissions } from '../servers/useGuildPermissions';
import { moderationRights } from '../serverSettings/memberAdminModel';
import { MemberActionSheet } from '../serverSettings/MemberActionSheet';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { usePresenceStore, useRelationshipStore } from '@discordy/core/application/stores/peopleStores';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import type { GuildMember, User } from '@discordy/core/contracts/rest';
import { statusLine } from '@discordy/core/domain/memberList';
import { openConversation } from '../dms/dmActions';
import { acceptRequest, addFriend, blockUser, removeRelationship } from '../friends/friendActions';
import { StatusAvatar } from '../members/StatusAvatar';
import { useLastValue } from '../sheets/useLastValue';
import { getRuntime } from '../runtime';
import { theme } from '../theme';
import { Button } from '../ui/controls';
import { Sheet, SheetConfirm } from '../ui/Sheet';
import { MutualFriends, MutualServers, ProfileField, ProfileNote } from './ProfileSections';
import { mutualServers, profileActions, profileView } from './profileModel';

interface Fetched {
  id: string;
  bio: string;
  servers: { id: string; nick?: string | null }[];
  friends: User[];
}

/**
 * One person's full profile as a bottom sheet, like desktop's: banner colour, avatar with status, names, what they are doing, Message and the
 * friend and block buttons, About me, roles and join date in a server, your private note, mutual servers and friends, and Friends since.
 */
export function ProfileSheet({ user: shown, guildId, onClose }: { user: User | null; guildId?: string; onClose(): void }) {
  const user = useLastValue(shown);
  const relationship = useRelationshipStore((s) => (user ? s.byUser[user.id] : undefined));
  const status = usePresenceStore((s) => (user ? (s.byUser[user.id]?.status ?? 'offline') : 'offline'));
  const activities = usePresenceStore((s) => (user ? s.byUser[user.id]?.activities : undefined));
  const guilds = useGuildStore((s) => s.guilds);
  const guild = guildId ? guilds[guildId] : undefined;
  const member = useGuildStore((s) => (guildId && user ? s.members[guildId]?.[user.id] : undefined));
  const me = useSessionStore((s) => s.user?.id);
  const [fetched, setFetched] = useState<Fetched | null>(null);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [managing, setManaging] = useState<GuildMember | null>(null);
  const perms = useGuildPermissions(guildId ?? '');
  const myMember = useGuildStore((s) => (guildId && me ? s.members[guildId]?.[me] : undefined));

  useEffect(() => {
    if (!user) return;
    let current = true;
    getRuntime()
      .api.userProfile(user.id)
      .then((profile) => current && setFetched({ id: user.id, bio: profile.user.bio ?? '', servers: profile.mutual_guilds, friends: profile.mutual_friends }))
      // The cached user still shows; a failed refresh only means About me and the mutuals may be missing.
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [user]);

  const close = () => {
    setConfirmBlock(false);
    onClose();
  };
  const message = async () => {
    if (!user) return;
    const id = await openConversation([user.id]);
    if (!id) return;
    close();
    router.push(`/dms/${id}`);
  };

  const loaded = user && fetched?.id === user.id ? fetched : null;
  const view = user ? profileView(user, relationship, loaded?.bio, guild && member ? { roles: guild.roles, member } : undefined) : null;
  const actions = user ? profileActions(user.id === me, Boolean(user.bot), relationship) : null;
  const line = statusLine(activities)?.text;
  const banner = user?.accent_color ? `#${user.accent_color.toString(16).padStart(6, '0')}` : theme.raised;
  const name = view?.name ?? '';
  // Roles, nickname, timeout, kick and ban by the same rules as the member list in server settings; shown only when at least one applies.
  const manage = guild && member && me && moderationRights(guild, perms, myMember, me, member).any ? member : null;

  return (
    <>
    <Sheet visible={shown !== null} label="profile" closeLabel="Close profile" onClose={close}>
      {user && view && actions && confirmBlock && (
        <SheetConfirm
          body={`${name} will not be able to message you or send a friend request, and you will not be friends any more.`}
          confirmLabel="Block"
          onConfirm={() => {
            close();
            void blockUser(user.id);
          }}
          onCancel={() => setConfirmBlock(false)}
        />
      )}
      {user && view && actions && !confirmBlock && (
        <View style={styles.sheet}>
          <View testID="profile-banner" style={[styles.banner, { backgroundColor: banner }]} />
          <View style={styles.avatar}>
            <StatusAvatar user={user} status={status} size={72} />
          </View>
          <Text style={styles.name}>{view.name}</Text>
          <Text style={styles.username}>{view.username}</Text>
          {line ? <Text style={styles.activity}>{line}</Text> : null}
          <View style={styles.actions}>
            {actions.message && <Button label="Message" tone="primary" onPress={() => void message()} />}
            {actions.friend === 'add' && <Button label="Add friend" onPress={() => void addFriend(user.username)} />}
            {actions.friend === 'accept' && <Button label="Accept friend request" onPress={() => void acceptRequest(user.id)} />}
            {actions.friend === 'sent' && <Button label="Request sent" disabled onPress={() => undefined} />}
            {actions.friend === 'remove' && <Button label="Remove friend" onPress={() => void removeRelationship(user.id, 'Could not remove the friend')} />}
            {actions.block === 'block' && <Button label="Block" tone="danger" onPress={() => setConfirmBlock(true)} />}
            {actions.block === 'unblock' && <Button label="Unblock" onPress={() => void removeRelationship(user.id, 'Could not unblock')} />}
            {manage && (
              <Button
                label={manage.user.id === me ? 'Edit server profile' : 'Manage member'}
                onPress={() => {
                  setManaging(manage);
                  close();
                }}
              />
            )}
          </View>
          <View style={styles.fields}>
          {view.bio !== '' && <ProfileField label="About me">{view.bio}</ProfileField>}
          {view.roles.length > 0 && <ProfileField label="Roles">{view.roles.join(', ')}</ProfileField>}
          {view.memberSince && <ProfileField label="Member since">{view.memberSince.toLocaleDateString()}</ProfileField>}
          {actions.block !== null && <ProfileNote userId={user.id} />}
          {loaded && actions.block !== null && !user.bot && <MutualServers servers={mutualServers(loaded.servers, guilds)} />}
          {loaded && actions.block !== null && !user.bot && <MutualFriends friends={loaded.friends} />}
          {view.friendsSince && <ProfileField label="Friends since">{view.friendsSince.toLocaleDateString()}</ProfileField>}
          </View>
        </View>
      )}
    </Sheet>
    {guildId && <MemberActionSheet guildId={guildId} member={managing} onClose={() => setManaging(null)} />}
    </>
  );
}

const styles = StyleSheet.create({
  sheet: { paddingBottom: 12 },
  banner: { height: 72, marginHorizontal: 0 },
  avatar: { marginTop: -36, marginLeft: 20, alignSelf: 'flex-start', borderRadius: 40, borderWidth: 4, borderColor: theme.surface },
  name: { color: theme.text, fontSize: 22, fontWeight: '700', marginTop: 8, paddingHorizontal: 20 },
  username: { color: theme.muted, marginTop: 2, paddingHorizontal: 20 },
  activity: { color: theme.muted, fontSize: 14, marginTop: 4, paddingHorizontal: 20 },
  fields: { paddingHorizontal: 20 },
  actions: { gap: 8, marginTop: 16, paddingHorizontal: 20 },
});
