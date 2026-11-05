import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { muteScope, setLevel } from '@discordy/core/application/notificationActions';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useNotificationSettingsStore } from '@discordy/core/application/stores/notificationSettingsStore';
import type { NotificationLevel } from '@discordy/core/contracts/rest';
import { channelOverride, isChannelMuted, MUTE_DURATIONS, NOTIFICATION_LEVELS, scopeKey } from '@discordy/core/domain/notificationSettings';
import { Permission } from '@discordy/core/contracts/permissions';
import { hasPermission } from '@discordy/core/domain/permissions';
import { InviteContent } from '../invites/InviteContent';
import { inviteChannelId } from '../invites/inviteModel';
import { getRuntime } from '../runtime';
import { useGuildPermissions } from '../servers/useGuildPermissions';
import { theme } from '../theme';
import { attempt } from '../ui/attempt';
import { Sheet, SheetOption } from '../ui/Sheet';

type Step = 'menu' | 'mute' | 'notifications' | 'invite';

const icon = (name: keyof typeof Ionicons.glyphMap, color: string = theme.text) => <Ionicons name={name} size={20} color={color} />;

export interface ChannelMenuProps {
  visible: boolean;
  guildId: string | undefined;
  channelId: string;
  onClose(): void;
  onMarkRead(): void;
  onSearch(): void;
}

/** The chat header's menu: Mark as read, Mute or Unmute, Notification settings and (in a server, with the permission) Invite people. */
export function ChannelMenu({ visible, guildId, channelId, onClose, onMarkRead, onSearch }: ChannelMenuProps) {
  const [step, setStep] = useState<Step>('menu');
  const settings = useNotificationSettingsStore((s) => s.byScope[scopeKey(guildId)]);
  const channels = useGuildStore((s) => s.channels);
  const perms = useGuildPermissions(guildId ?? '');
  const muted = isChannelMuted(settings, channelId, Date.now());
  const level = channelOverride(settings, channelId)?.message_notifications ?? null;
  const canInvite = guildId !== undefined && hasPermission(perms, Permission.CREATE_INSTANT_INVITE) && inviteChannelId(channels, guildId) !== null;

  const close = () => {
    setStep('menu');
    onClose();
  };
  const mute = (seconds: number | null | undefined) => {
    close();
    void attempt(() => muteScope(getRuntime().api, guildId ?? null, channelId, seconds), 'Could not change mute');
  };
  const choose = (value: NotificationLevel | null) => {
    close();
    void attempt(() => setLevel(getRuntime().api, guildId ?? null, channelId, value), 'Could not change notifications');
  };

  const title = step === 'mute' ? 'Mute channel' : step === 'notifications' ? 'Notification settings' : step === 'invite' ? 'Invite people' : undefined;
  return (
    <Sheet visible={visible} {...(title ? { title } : {})} closeLabel="Close channel menu" onClose={close}>
      {step === 'menu' && (
        <>
          <SheetOption
            label="Search"
            icon={icon('search-outline')}
            onPress={() => {
              close();
              onSearch();
            }}
          />
          <SheetOption
            label="Mark as read"
            icon={icon('checkmark-done-outline')}
            onPress={() => {
              close();
              onMarkRead();
            }}
          />
          {muted ? <SheetOption label="Unmute channel" icon={icon('notifications-outline')} onPress={() => mute(undefined)} /> : <SheetOption label="Mute channel" icon={icon('notifications-off-outline')} onPress={() => setStep('mute')} />}
          <SheetOption label="Notification settings" icon={icon('options-outline')} onPress={() => setStep('notifications')} />
          {canInvite && <SheetOption label="Invite people" icon={icon('person-add-outline')} onPress={() => setStep('invite')} />}
        </>
      )}
      {step === 'mute' && MUTE_DURATIONS.map((d) => <SheetOption key={d.id} label={d.label} onPress={() => mute(d.seconds)} />)}
      {step === 'notifications' && (
        <>
          <SheetOption label={`Server default${level === null ? ' (selected)' : ''}`} onPress={() => choose(null)} />
          {NOTIFICATION_LEVELS.map((l) => (
            <SheetOption key={l.value} label={`${l.label}${level === l.value ? ' (selected)' : ''}`} onPress={() => choose(l.value)} />
          ))}
        </>
      )}
      {step === 'invite' && guildId && <InviteContent guildId={guildId} />}
    </Sheet>
  );
}
