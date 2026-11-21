import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useRelationshipStore } from '@discordy/core/application/stores/peopleStores';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import type { DeliveryMode, UserSettings } from '@discordy/core/contracts/rest';
import { DELIVERY_MODES, MODE_COPY } from '@discordy/core/domain/deliveryMode';
import { buildFriendsView } from '@discordy/core/domain/friendsModel';
import { dmTitle } from '../dms/dmModel';
import { removeRelationship } from '../friends/friendActions';
import { getRuntime } from '../runtime';
import { theme } from '../theme';
import { attempt, confirmDestructive } from '../ui/attempt';
import { Button } from '../ui/controls';
import { Hint, SectionLabel, SettingRow, SettingsPage, SwitchRow } from './rows';

/** Encrypted modes need the encryption core, which is not in the mobile app yet; desktop disables them the same way when its core is missing. */
export const ENCRYPTION_UNAVAILABLE = 'Encrypted modes are not available in the mobile app yet. Nothing is ever sent unencrypted in a private mode.';

/** Desktop's Privacy and delivery page, plus the list of blocked people with Unblock. */
export function PrivacyPage({ highlight }: { highlight: string | null }) {
  const settings = useSessionStore((s) => s.settings);
  const channels = useGuildStore((s) => s.channels);
  const relationships = useRelationshipStore((s) => s.byUser);
  const blocked = buildFriendsView(Object.values(relationships), {}).blocked;
  const overrides = Object.entries(settings.delivery_overrides ?? {});
  const flags = settings.friend_source_flags;
  const setSource = (field: keyof NonNullable<UserSettings['friend_source_flags']>, value: boolean) =>
    void attempt(async () => {
      useSessionStore.getState().setSettings(await getRuntime().api.updateSettings({ friend_source_flags: { [field]: value } }));
    }, 'Could not update friend request settings');

  const choose = (mode: DeliveryMode) =>
    void attempt(async () => {
      useSessionStore.getState().setSettings(await getRuntime().api.updateSettings({ default_delivery_mode: mode }));
    }, 'Could not update default');

  const setCallsEncrypted = (enabled: boolean) =>
    void attempt(async () => {
      useSessionStore.getState().setSettings(await getRuntime().api.updateSettings({ e2ee_calls_default: enabled }));
    }, 'Could not update call encryption');

  const clearOverride = (channelId: string) =>
    void attempt(async () => {
      await getRuntime().api.setChannelDeliveryOverride(channelId, null);
      const next = { ...(settings.delivery_overrides ?? {}) };
      delete next[channelId];
      useSessionStore.getState().setSettings({ delivery_overrides: next });
    }, 'Could not clear override');

  const nameOf = (channelId: string) => {
    const channel = channels[channelId];
    if (!channel) return 'A chat';
    return channel.guild_id ? `#${channel.name ?? 'channel'}` : dmTitle(channel, relationships);
  };

  return (
    <SettingsPage highlight={highlight}>
      <Hint>Choose how your direct messages travel. The strictest setting among participants wins.</Hint>
      <SettingRow title="Default delivery mode" stacked>
        <View accessibilityRole="radiogroup" accessibilityLabel="Default delivery mode for new direct messages" style={styles.cards}>
          {DELIVERY_MODES.map((mode) => {
            const on = settings.default_delivery_mode === mode;
            const unavailable = mode !== 'standard';
            return (
              <Pressable
                key={mode}
                accessibilityRole="radio"
                accessibilityLabel={MODE_COPY[mode].label}
                accessibilityState={{ selected: on, disabled: unavailable }}
                disabled={unavailable}
                onPress={() => choose(mode)}
                style={[styles.card, on && styles.cardOn, unavailable && styles.cardOff]}
              >
                <Text style={styles.cardTitle}>{MODE_COPY[mode].label}</Text>
                <Text style={styles.cardText}>{MODE_COPY[mode].description}</Text>
              </Pressable>
            );
          })}
        </View>
      </SettingRow>
      <Hint>{ENCRYPTION_UNAVAILABLE}</Hint>

      {flags && <>
        <SectionLabel>Friend requests</SectionLabel>
        <Hint>When Everyone is off, people can send a new request if they match any enabled source. Existing friends and pending requests remain available.</Hint>
        <SwitchRow title="Friend requests from everyone" value={flags.all === true} onChange={(v) => setSource('all', v)} />
        <SwitchRow title="Friend requests from friends of friends" value={flags.mutual_friends === true} onChange={(v) => setSource('mutual_friends', v)} />
        <SwitchRow title="Friend requests from shared server members" value={flags.mutual_guilds === true} onChange={(v) => setSource('mutual_guilds', v)} />
      </>}
      <SectionLabel>Calls</SectionLabel>
      <SwitchRow title="Encrypt all my calls end-to-end" description="Applies to DMs, group DMs, voice channels and Go Live. If anyone in a call has this on, the whole call is encrypted." value={settings.e2ee_calls_default === true} onChange={setCallsEncrypted} />

      <SectionLabel>Per-chat overrides</SectionLabel>
      {overrides.length === 0 && <Hint>No chats override your default. Change a chat's mode from its composer on desktop.</Hint>}
      {overrides.map(([channelId, mode]) => (
        <SettingRow key={channelId} title={nameOf(channelId)} description={MODE_COPY[mode].label}>
          <Button label="Clear" onPress={() => clearOverride(channelId)} />
        </SettingRow>
      ))}

      <SectionLabel>Blocked users</SectionLabel>
      {blocked.length === 0 && <Hint>You have not blocked anyone. Block someone from their profile or from the menu of one of their messages.</Hint>}
      {blocked.map((rel) => {
        const name = rel.nickname || rel.user.global_name || rel.user.username;
        return (
          <SettingRow key={rel.id} title={name} description={rel.user.username}>
            <Button label="Unblock" onPress={() => confirmDestructive(`Unblock ${name}?`, 'They will be able to message you and send you a friend request again.', 'Unblock', () => void removeRelationship(rel.id, 'Could not unblock'))} />
          </SettingRow>
        );
      })}
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  cards: { gap: 8 },
  card: { padding: 14, borderRadius: 12, backgroundColor: theme.raised, borderWidth: 1, borderColor: theme.hairline },
  cardOn: { borderColor: theme.accent, backgroundColor: theme.accentSoft },
  cardOff: { opacity: 0.5 },
  cardTitle: { color: theme.text, fontSize: 15, fontWeight: '600' },
  cardText: { color: theme.muted, fontSize: 13, marginTop: 4 },
});
