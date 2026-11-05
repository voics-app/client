import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useRelationshipStore } from '@discordy/core/application/stores/peopleStores';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { ChannelType, type User } from '@discordy/core/contracts/rest';
import { MAX_GROUP_DM_MEMBERS } from '@discordy/core/domain/dmModel';
import { leaveGroup } from '../dms/dmActions';
import { Avatar } from '../profile/Avatar';
import { getRuntime } from '../runtime';
import { iconUpload } from '../serverSettings/overviewModel';
import { theme } from '../theme';
import { attempt, confirmDestructive } from '../ui/attempt';
import { Button, Field, Notice, SectionTitle } from '../ui/controls';
import { ListRow } from '../ui/ListRow';
import { GROUP_NAME_MAX, groupSettingsView } from './groupModel';

function Body({ channelId }: { channelId: string }) {
  const channel = useGuildStore((s) => s.channels[channelId]);
  const me = useSessionStore((s) => s.user);
  const relationships = useRelationshipStore((s) => s.byUser);
  const [name, setName] = useState(channel?.name ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [icon, setIcon] = useState<string | undefined>();
  if (!channel || channel.type !== ChannelType.GROUP_DM || !me) return <Notice>This group is not available.</Notice>;
  const view = groupSettingsView(channel, me, relationships);

  const patch = async (body: Record<string, unknown>, title: string) => {
    setBusy(true);
    const updated = await attempt(() => getRuntime().api.updateChannel(channelId, body), title);
    setBusy(false);
    if (updated) useGuildStore.getState().upsertChannel({ ...channel, ...updated });
    return Boolean(updated);
  };

  const pickIcon = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8, base64: true });
    const asset = result.canceled ? undefined : result.assets[0];
    if (!asset) return;
    const upload = iconUpload(asset);
    if ('error' in upload) return setError(upload.error);
    setError(null);
    if (await patch({ icon: upload.uri }, 'Could not change the icon')) setIcon(upload.uri);
  };

  const add = async (user: User) => {
    const done = await attempt(async () => {
      await getRuntime().api.addGroupRecipient(channelId, user.id);
      return true;
    }, 'Could not add the member');
    if (done) useGuildStore.getState().upsertChannel({ ...channel, recipients: [...(channel.recipients ?? []).filter((u) => u.id !== user.id), user] });
  };

  const remove = (user: User) =>
    confirmDestructive(`Remove ${user.global_name || user.username}?`, 'They will no longer see this group.', 'Remove', () => {
      void attempt(async () => {
        await getRuntime().api.removeGroupRecipient(channelId, user.id);
        useGuildStore.getState().upsertChannel({ ...channel, recipients: (channel.recipients ?? []).filter((u) => u.id !== user.id) });
      }, 'Could not remove the member');
    });

  const leave = () =>
    confirmDestructive('Leave group DM?', 'You will stop receiving messages from this group. You can only rejoin if a member adds you back.', 'Leave group DM', () => {
      void leaveGroup(channelId).then(() => router.dismissAll());
    });

  const shownIcon = icon ?? undefined;
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.iconRow}>
        {shownIcon ? <Image accessibilityIgnoresInvertColors source={{ uri: shownIcon }} style={styles.icon} /> : <View style={styles.icon}><Avatar user={{ id: channel.id, avatar: null, username: channel.name || 'Group', global_name: channel.name || 'Group' }} size={72} /></View>}
        <View style={styles.iconActions}>
          <Button label="Change icon" onPress={() => void pickIcon()} />
          {(channel.icon || shownIcon) && <Button label="Remove icon" onPress={() => void patch({ icon: null }, 'Could not remove the icon').then((ok) => ok && setIcon(undefined))} />}
        </View>
      </View>
      {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      <Field label="Group name" value={name} maxLength={GROUP_NAME_MAX} placeholder="Unnamed group" autoCapitalize="sentences" onChangeText={setName} />
      <Button label="Save name" tone="primary" busy={busy} disabled={name.trim() === '' || name.trim() === (channel.name ?? '')} onPress={() => void patch({ name: name.trim() }, 'Could not rename the group')} />

      <SectionTitle>{`Members (${view.members.length}/${MAX_GROUP_DM_MEMBERS})`}</SectionTitle>
      {!view.canChangeMembers && <Text style={styles.note}>This group is end-to-end encrypted. Adding and removing people needs the encryption core, which the mobile app does not have yet; use the desktop app.</Text>}
      {view.members.map((u) => (
        <ListRow
          key={u.id}
          title={`${u.global_name || u.username}${u.id === me.id ? ' (you)' : ''}${u.id === channel.owner_id ? ' - owner' : ''}`}
          subtitle={u.username}
          left={<Avatar user={u} size={36} />}
          right={view.isOwner && view.canChangeMembers && u.id !== me.id ? <Button label="Remove" tone="danger" accessibilityLabel={`Remove ${u.global_name || u.username}`} onPress={() => remove(u)} /> : undefined}
        />
      ))}

      {view.canChangeMembers && !view.full && view.addable.length > 0 && (
        <>
          <SectionTitle>Add friends</SectionTitle>
          {view.addable.map((u) => (
            <ListRow key={u.id} title={u.global_name || u.username} subtitle={u.username} left={<Avatar user={u} size={36} />} right={<Button label="Add" accessibilityLabel={`Add ${u.global_name || u.username}`} onPress={() => void add(u)} />} />
          ))}
        </>
      )}
      {view.canChangeMembers && view.full && <Text style={styles.note}>This group is full.</Text>}

      <View style={styles.leave}>
        <Button label="Leave group" tone="danger" onPress={leave} />
      </View>
    </ScrollView>
  );
}

/** Desktop's Group settings: name, icon, members (friends can be added; the owner removes people) and leave. */
export function GroupSettingsScreen({ channelId }: { channelId: string }) {
  return <Body channelId={channelId} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.background },
  content: { padding: 16, paddingBottom: 48 },
  iconRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 16 },
  icon: { width: 72, height: 72, borderRadius: 36, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  iconActions: { flex: 1, gap: 8 },
  error: { color: theme.danger, marginBottom: 8 },
  note: { color: theme.subtle, fontSize: 13, paddingVertical: 8 },
  leave: { marginTop: 24 },
});
