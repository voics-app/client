import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { deleteGuild, leaveGuild, markGuildRead } from '@discordy/core/application/guildCommands';
import { muteScope, setLevel, setToggles, type GuildToggles } from '@discordy/core/application/notificationActions';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useNotificationSettingsStore } from '@discordy/core/application/stores/notificationSettingsStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import type { NotificationLevel } from '@discordy/core/contracts/rest';
import { isGuildMuted, MUTE_DURATIONS, NOTIFICATION_LEVELS, scopeKey } from '@discordy/core/domain/notificationSettings';
import { InviteContent } from '../invites/InviteContent';
import { openEvent } from '../events/openEvent';
import { inviteChannelId } from '../invites/inviteModel';
import { getRuntime } from '../runtime';
import { useGuildPermissions } from '../servers/useGuildPermissions';
import { theme } from '../theme';
import { attempt } from '../ui/attempt';
import { Button, Field } from '../ui/controls';
import { Sheet, SheetConfirm, SheetOption } from '../ui/Sheet';
import { canDeleteWithName, serverMenuEntries } from './serverMenuModel';

type Step = 'menu' | 'invite' | 'leave' | 'mute' | 'notifications' | 'delete';

const icon = (name: keyof typeof Ionicons.glyphMap, color: string = theme.text) => <Ionicons name={name} size={20} color={color} />;

const TOGGLES: { key: keyof GuildToggles; label: string }[] = [
  { key: 'suppress_everyone', label: 'Suppress @everyone and @here' },
  { key: 'suppress_roles', label: 'Suppress all role mentions' },
  { key: 'hide_muted_channels', label: 'Hide muted channels' },
];

/** The owner types the server's name before it is deleted for everyone; desktop asks a plain question, this adds the name because it cannot be undone. */
function DeleteConfirm({ name, onConfirm, onCancel }: { name: string; onConfirm(): void; onCancel(): void }) {
  const [typed, setTyped] = useState('');
  return (
    <View style={styles.form}>
      <Text style={styles.body}>This permanently deletes the server, its channels and messages for everyone. This cannot be undone.</Text>
      <Field label={`Type ${name} to confirm`} value={typed} onChangeText={setTyped} autoCapitalize="sentences" />
      <Button label="Delete server" tone="danger" disabled={!canDeleteWithName(typed, name)} onPress={onConfirm} />
      <Button label="Cancel" onPress={onCancel} />
    </View>
  );
}

/** Desktop's server menu from the column header: Mark as read, Mute, Notification settings, Invite people, Server settings (only with the permission), and Leave server or, for the owner, Delete server (each asks first). */
export function ServerMenu({ guildId, visible, onClose }: { guildId: string; visible: boolean; onClose(): void }) {
  const guild = useGuildStore((s) => s.guilds[guildId]);
  const channels = useGuildStore((s) => s.channels);
  const me = useSessionStore((s) => s.user?.id);
  const settings = useNotificationSettingsStore((s) => s.byScope[scopeKey(guildId)]);
  const perms = useGuildPermissions(guildId);
  const [step, setStep] = useState<Step>('menu');
  if (!guild) return null;
  const entries = serverMenuEntries(perms, guild.owner_id === me, inviteChannelId(channels, guildId) !== null);
  const muted = isGuildMuted(settings, Date.now());
  const level = settings?.message_notifications ?? null;

  const close = () => {
    setStep('menu');
    onClose();
  };
  const run = (action: () => Promise<unknown>, failure: string) => {
    close();
    void attempt(action, failure);
  };
  const leave = async () => {
    close();
    if (await attempt(() => leaveGuild(getRuntime().api, guildId).then(() => true), 'Could not leave server')) useUiStore.getState().navigate({ kind: 'home', channelId: null });
  };
  const remove = async () => {
    close();
    if (await attempt(() => deleteGuild(getRuntime().api, guildId).then(() => true), 'Could not delete server')) useUiStore.getState().navigate({ kind: 'home', channelId: null });
  };

  const titles: Record<Step, string> = {
    menu: guild.name,
    invite: `Invite people to ${guild.name}`,
    leave: `Leave ${guild.name}?`,
    mute: 'Mute server',
    notifications: 'Notification settings',
    delete: `Delete ${guild.name}?`,
  };

  return (
    <Sheet visible={visible} title={titles[step]} closeLabel="Close server menu" onClose={close}>
      {step === 'invite' && <InviteContent guildId={guildId} />}
      {step === 'leave' && <SheetConfirm body="You will need a new invite to rejoin." confirmLabel="Leave server" onConfirm={() => void leave()} onCancel={close} />}
      {step === 'delete' && <DeleteConfirm name={guild.name} onConfirm={() => void remove()} onCancel={close} />}
      {step === 'mute' && MUTE_DURATIONS.map((d) => <SheetOption key={d.id} label={d.label} onPress={() => run(() => muteScope(getRuntime().api, guildId, null, d.seconds), 'Could not change mute')} />)}
      {step === 'notifications' && (
        <>
          {NOTIFICATION_LEVELS.map((l) => (
            <SheetOption key={l.value} label={`${l.label}${level === l.value ? ' (selected)' : ''}`} onPress={() => run(() => setLevel(getRuntime().api, guildId, null, l.value as NotificationLevel), 'Could not change notifications')} />
          ))}
          {TOGGLES.map((t) => (
            <View key={t.key} style={styles.toggle}>
              <Text style={styles.toggleText}>{t.label}</Text>
              <Switch accessibilityLabel={t.label} value={settings?.[t.key] === true} onValueChange={(on) => void attempt(() => setToggles(getRuntime().api, guildId, { [t.key]: on }), 'Could not change notifications')} trackColor={{ true: theme.accent }} />
            </View>
          ))}
        </>
      )}
      {step === 'menu' && (
        <>
          <SheetOption label="Events" icon={icon('calendar-outline')} onPress={() => { close(); openEvent(guildId); }} />
          <SheetOption label="Mark as read" icon={icon('checkmark-done-outline')} onPress={() => { close(); markGuildRead(getRuntime().api, guildId); }} />
          {muted ? <SheetOption label="Unmute server" icon={icon('notifications-outline')} onPress={() => run(() => muteScope(getRuntime().api, guildId, null, undefined), 'Could not change mute')} /> : <SheetOption label="Mute server" icon={icon('notifications-off-outline')} onPress={() => setStep('mute')} />}
          <SheetOption label="Notification settings" icon={icon('options-outline')} onPress={() => setStep('notifications')} />
          {entries.invite && <SheetOption label="Invite people" icon={icon('person-add-outline')} onPress={() => setStep('invite')} />}
          {entries.settings && (
            <SheetOption
              label="Server settings"
              icon={icon('settings-outline')}
              onPress={() => {
                close();
                router.push(`/servers/${guildId}/settings`);
              }}
            />
          )}
          {entries.leave && <SheetOption label="Leave server" danger icon={icon('log-out-outline', theme.danger)} onPress={() => setStep('leave')} />}
          {entries.delete && <SheetOption label="Delete server" danger icon={icon('trash-outline', theme.danger)} onPress={() => setStep('delete')} />}
          <SheetOption label="Cancel" onPress={close} />
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  form: { paddingHorizontal: 20, paddingBottom: 8 },
  body: { color: theme.muted, fontSize: 14, marginBottom: 12 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingHorizontal: 20 },
  toggleText: { flex: 1, color: theme.text, fontSize: 16 },
});
