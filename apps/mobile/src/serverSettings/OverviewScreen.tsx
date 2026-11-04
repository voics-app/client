import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { draftFromGuild, overviewPatch } from '@discordy/core/domain/guildOverview';
import { ServerIcon } from '../shell/ServerIcon';
import { getRuntime } from '../runtime';
import { theme } from '../theme';
import { attempt } from '../ui/attempt';
import { Button, Field } from '../ui/controls';
import { iconUpload } from './overviewModel';
import { PageGuard } from './PageGuard';

function Body({ guildId }: { guildId: string }) {
  const guild = useGuildStore((s) => s.guilds[guildId]);
  const [name, setName] = useState(guild?.name ?? '');
  /** undefined keeps the icon, null removes it, a data URI replaces it. */
  const [icon, setIcon] = useState<string | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  if (!guild) return null;

  const patch = overviewPatch(guild, { ...draftFromGuild(guild), name: name.trim(), icon });
  const dirty = Object.keys(patch).length > 0 && name.trim().length > 0;

  const pick = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8, base64: true });
    const asset = result.canceled ? undefined : result.assets[0];
    if (!asset) return;
    const upload = iconUpload(asset);
    if ('error' in upload) setError(upload.error);
    else {
      setError(null);
      setIcon(upload.uri);
    }
  };

  const save = async () => {
    setSaving(true);
    const updated = await attempt(() => getRuntime().api.updateGuild(guildId, patch), 'Could not save server');
    setSaving(false);
    if (updated) {
      useGuildStore.getState().patchGuild({ ...updated, id: guildId });
      setIcon(undefined);
    }
  };

  const showsIcon = icon === undefined ? guild.icon !== null : icon !== null;
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.iconRow}>
        <Pressable accessibilityRole="button" accessibilityLabel="Change server icon" onPress={() => void pick()} style={styles.icon}>
          {typeof icon === 'string' ? <Image accessibilityIgnoresInvertColors source={{ uri: icon }} style={styles.preview} /> : icon === null ? <ServerIcon guild={{ ...guild, icon: null }} /> : <ServerIcon guild={guild} />}
        </Pressable>
        <View style={styles.iconActions}>
          <Button label={showsIcon ? 'Change icon' : 'Upload icon'} onPress={() => void pick()} />
          {showsIcon && <Button label="Remove icon" onPress={() => setIcon(null)} />}
        </View>
      </View>
      {error && (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      )}
      <Field label="Server name" value={name} maxLength={100} autoCapitalize="sentences" onChangeText={setName} />
      <Button tone="primary" label="Save changes" busy={saving} disabled={!dirty} onPress={() => void save()} />
    </ScrollView>
  );
}

/** Server settings > Overview: the name and the icon (picked from the photo library), saved with the same update the desktop uses. */
export function OverviewScreen({ guildId }: { guildId: string }) {
  return (
    <PageGuard guildId={guildId} page="overview" title="Overview">
      <Body guildId={guildId} />
    </PageGuard>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.background },
  content: { padding: 20 },
  iconRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 20 },
  icon: { width: 96, height: 96, borderRadius: 24, overflow: 'hidden', backgroundColor: theme.raised, alignItems: 'center', justifyContent: 'center' },
  preview: { width: '100%', height: '100%' },
  iconActions: { flex: 1, gap: 8 },
  error: { color: theme.danger, marginBottom: 12 },
});
