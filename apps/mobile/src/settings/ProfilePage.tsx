import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { BIO_MAX_LENGTH } from '@discordy/core/domain/profile';
import { customStatusLine, STATUS_CHOICES, type ManualStatus } from '@discordy/core/domain/selfPresence';
import { Avatar } from '../profile/Avatar';
import { getRuntime } from '../runtime';
import { SWATCHES } from '../serverSettings/roleModel';
import { iconUpload } from '../serverSettings/overviewModel';
import { theme } from '../theme';
import { attempt } from '../ui/attempt';
import { Button, Choices, Field } from '../ui/controls';
import { CustomStatusForm } from './CustomStatusForm';
import { setStatus } from './presence';
import { DISPLAY_NAME_MAX, draftOf, profilePatch, shownColor, type ProfileDraft } from './profileEditModel';
import { SectionLabel, SettingRow, SettingsPage } from './rows';

/** Desktop's Profile page (display name, About me, colour, avatar) plus the banner, and the status pickers desktop keeps in its user panel. */
export function ProfilePage({ highlight }: { highlight: string | null }) {
  const user = useSessionStore((s) => s.user);
  const status = useSessionStore((s) => s.settings.status ?? 'online');
  const storedCustom = useSessionStore((s) => s.settings.custom_status);
  const [draft, setDraft] = useState<ProfileDraft>(() => draftOf(user ?? { global_name: null }));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  if (!user) return null;

  const patch = profilePatch(user, draft);
  const dirty = Object.keys(patch).length > 0;
  const set = (change: Partial<ProfileDraft>) => setDraft((d) => ({ ...d, ...change }));

  const pick = async (field: 'avatar' | 'banner') => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: field === 'avatar' ? [1, 1] : [3, 1], quality: 0.8, base64: true });
    const asset = result.canceled ? undefined : result.assets[0];
    if (!asset) return;
    const upload = iconUpload(asset);
    if ('error' in upload) setError(upload.error);
    else {
      setError(null);
      set({ [field]: upload.uri });
    }
  };

  const save = async () => {
    setSaving(true);
    const updated = await attempt(() => getRuntime().api.updateMe(patch), 'Could not save profile');
    setSaving(false);
    if (updated) {
      useSessionStore.getState().setUser(updated);
      setDraft(draftOf(updated));
    }
  };

  const color = shownColor(user, draft);
  return (
    <SettingsPage highlight={highlight}>
      <SettingRow title="Avatar" stacked>
        <View style={styles.images}>
          <Pressable accessibilityRole="button" accessibilityLabel="Change avatar" onPress={() => void pick('avatar')} style={styles.avatar}>
            {draft.avatar ? <Image accessibilityIgnoresInvertColors source={{ uri: draft.avatar }} style={styles.avatarPreview} /> : <Avatar user={user} size={96} />}
          </Pressable>
          <Button label="Change avatar" onPress={() => void pick('avatar')} />
        </View>
      </SettingRow>
      <SettingRow title="Banner" description="Shown behind your avatar on your profile." stacked>
        <Pressable accessibilityRole="button" accessibilityLabel="Change banner" onPress={() => void pick('banner')} style={[styles.banner, { backgroundColor: color ?? theme.raised }]}>
          {draft.banner ? <Image accessibilityIgnoresInvertColors source={{ uri: draft.banner }} style={styles.bannerPreview} /> : <Text style={styles.bannerText}>{user.banner ? 'Tap to replace your banner' : 'Tap to add a banner'}</Text>}
        </Pressable>
      </SettingRow>
      {error && (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      )}
      <View style={styles.fields}>
        <Field label="Display name" value={draft.globalName} placeholder={user.username} maxLength={DISPLAY_NAME_MAX} autoCapitalize="sentences" onChangeText={(globalName) => set({ globalName })} />
        <Field label="About me" value={draft.bio} maxLength={BIO_MAX_LENGTH} multiline autoCapitalize="sentences" onChangeText={(bio) => set({ bio })} />
      </View>
      <SettingRow title="Profile colour" stacked>
        <View accessibilityRole="radiogroup" style={styles.swatches}>
          {SWATCHES.map((hex) => (
            <Pressable key={hex} accessibilityRole="radio" accessibilityLabel={`Profile colour ${hex}`} accessibilityState={{ selected: color === hex }} onPress={() => set({ color: hex })} style={[styles.swatch, { backgroundColor: hex }, color === hex && styles.swatchOn]} />
          ))}
        </View>
      </SettingRow>
      <View style={styles.save}>
        <Button label="Save changes" tone="primary" busy={saving} disabled={!dirty} onPress={() => void save()} />
        <Button label="Discard changes" disabled={!dirty || saving} onPress={() => { setDraft(draftOf(user)); setError(null); }} />
      </View>

      <SectionLabel>Status</SectionLabel>
      <View style={styles.fields}>
        <Choices label="Status" options={STATUS_CHOICES.map((s) => ({ value: s.id, label: s.label }))} value={status as ManualStatus} onChange={(value) => void setStatus(value)} />
      </View>
      <SettingRow title="Custom status" description={customStatusLine(storedCustom, Date.now()) || 'Say what you are up to.'} stacked>
        <CustomStatusForm />
      </SettingRow>
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  images: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  avatar: { width: 96, height: 96, borderRadius: 48, overflow: 'hidden' },
  avatarPreview: { width: 96, height: 96, borderRadius: 48 },
  banner: { height: 96, borderRadius: 12, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  bannerPreview: { width: '100%', height: '100%' },
  bannerText: { color: theme.text, fontSize: 14, textShadowColor: 'rgba(0, 0, 0, 0.5)', textShadowRadius: 4 },
  error: { color: theme.danger, paddingHorizontal: 16, marginBottom: 8 },
  fields: { paddingHorizontal: 16, paddingTop: 8 },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  swatch: { width: 44, height: 44, borderRadius: 22, borderWidth: 3, borderColor: 'transparent' },
  swatchOn: { borderColor: theme.text },
  save: { gap: 8, paddingHorizontal: 16, paddingVertical: 8 },
});
