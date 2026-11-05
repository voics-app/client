import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import type { Emoji } from '@discordy/core/contracts/rest';
import { BRAND } from '../brand';
import { getRuntime } from '../runtime';
import { useLastValue } from '../sheets/useLastValue';
import { theme } from '../theme';
import { attempt, confirmDestructive } from '../ui/attempt';
import { Button, Field, Notice } from '../ui/controls';
import { ListRow } from '../ui/ListRow';
import { Sheet } from '../ui/Sheet';
import { emojiNameFor, emojiUpload } from './emojiModel';
import { PageGuard } from './PageGuard';

const emojiUri = (e: Emoji) => `${BRAND.cdnUrl}/emojis/${e.id}.${e.animated ? 'gif' : 'png'}`;

function RenameSheet({ guildId, emoji: shown, onClose }: { guildId: string; emoji: Emoji | null; onClose(): void }) {
  const emoji = useLastValue(shown);
  const [name, setName] = useState(emoji?.name ?? '');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const guild = useGuildStore.getState().guilds[guildId];
    if (!emoji?.id || !guild) return;
    setBusy(true);
    const updated = await attempt(() => getRuntime().api.updateEmoji(guildId, emoji.id!, { name: emojiNameFor(name) }), 'Could not rename emoji');
    setBusy(false);
    if (updated) {
      useGuildStore.getState().setEmojis(guildId, guild.emojis.map((e) => (e.id === emoji.id ? updated : e)));
      onClose();
    }
  };
  return (
    <Sheet visible={shown !== null} title="Rename emoji" closeLabel="Close rename emoji" onClose={onClose}>
      <View style={styles.form}>
        <Field label="Emoji name" value={name} maxLength={32} onChangeText={setName} />
        <Button label="Save name" tone="primary" busy={busy} disabled={emojiNameFor(name).length < 2 || emojiNameFor(name) === emoji?.name} onPress={() => void save()} />
      </View>
    </Sheet>
  );
}

function Body({ guildId }: { guildId: string }) {
  const guild = useGuildStore((s) => s.guilds[guildId]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<Emoji | null>(null);
  if (!guild) return null;

  const upload = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1, base64: true });
    const asset = result.canceled ? undefined : result.assets[0];
    if (!asset) return;
    const picked = emojiUpload(asset);
    if ('error' in picked) return setError(picked.error);
    setError(null);
    setBusy(true);
    const created = await attempt(() => getRuntime().api.createEmoji(guildId, { name: picked.name, image: picked.uri }), 'Could not upload emoji');
    setBusy(false);
    if (created) useGuildStore.getState().setEmojis(guildId, [...guild.emojis, created]);
  };

  const remove = (emoji: Emoji) =>
    confirmDestructive(`Delete :${emoji.name}:?`, 'Everyone loses this emoji; messages that used it show its name.', 'Delete emoji', () => {
      void attempt(async () => {
        await getRuntime().api.deleteEmoji(guildId, emoji.id!);
        useGuildStore.getState().setEmojis(guildId, guild.emojis.filter((e) => e.id !== emoji.id));
      }, 'Could not delete emoji');
    });

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.top}>
        <Button label="Upload emoji" tone="primary" busy={busy} onPress={() => void upload()} />
        <Text style={styles.hint}>PNG, GIF or WebP images up to 256 KB.</Text>
        {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      </View>
      {guild.emojis.length === 0 && <Notice>No custom emoji.</Notice>}
      {guild.emojis.map((e) => (
        <ListRow
          key={e.id ?? e.name}
          title={`:${e.name}:`}
          left={<Image accessibilityIgnoresInvertColors accessibilityLabel={e.name ?? 'emoji'} source={{ uri: emojiUri(e) }} style={styles.image} />}
          right={
            <View style={styles.actions}>
              <Button label="Rename" accessibilityLabel={`Rename ${e.name}`} onPress={() => setRenaming(e)} />
              <Button label="Delete" tone="danger" accessibilityLabel={`Delete ${e.name}`} onPress={() => remove(e)} />
            </View>
          }
        />
      ))}
      <RenameSheet key={renaming?.id ?? 'none'} guildId={guildId} emoji={renaming} onClose={() => setRenaming(null)} />
    </ScrollView>
  );
}

/** Server settings > Emoji: upload from the photo library, rename and delete (after a question). Needs Manage Expressions. */
export function EmojiScreen({ guildId }: { guildId: string }) {
  return (
    <PageGuard guildId={guildId} page="emoji" title="Emoji">
      <Body guildId={guildId} />
    </PageGuard>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.background },
  content: { paddingBottom: 40 },
  top: { padding: 16, gap: 8 },
  hint: { color: theme.subtle, fontSize: 13 },
  error: { color: theme.danger },
  image: { width: 36, height: 36 },
  actions: { flexDirection: 'row', gap: 8 },
  form: { paddingHorizontal: 20, paddingBottom: 8 },
});
