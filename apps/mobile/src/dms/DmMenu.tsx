import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useNotificationSettingsStore } from '@discordy/core/application/stores/notificationSettingsStore';
import { useReadStateStore } from '@discordy/core/application/stores/peopleStores';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import type { User } from '@discordy/core/contracts/rest';
import { buildDmMenu } from '@discordy/core/domain/dmModel';
import { DM_SCOPE, isChannelMuted, MUTE_DURATIONS } from '@discordy/core/domain/notificationSettings';
import { isPinFull, MAX_PINNED_DMS } from '@discordy/core/domain/pins';
import { isUnread } from '@discordy/core/domain/unread';
import { useMessageService } from '../messages/useMessageService';
import { useLastValue } from '../sheets/useLastValue';
import { theme } from '../theme';
import { Sheet, SheetConfirm, SheetOption } from '../ui/Sheet';
import { closeConversation, leaveGroup, muteConversation, pinConversation } from './dmActions';
import type { DmRow } from './dmModel';

type Step = 'menu' | 'mute' | 'leave';

const ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  markRead: 'checkmark-done-outline',
  pin: 'pin-outline',
  unpin: 'pin',
  profile: 'person-circle-outline',
  settings: 'people-outline',
  unmute: 'notifications-outline',
  mute: 'notifications-off-outline',
  close: 'close-circle-outline',
  leave: 'exit-outline',
};

/** The long-press menu of a conversation, built from core's `buildDmMenu`: mark as read, pin, profile, mute, close and (groups) leave. */
export function DmMenu({ row: shown, onClose, onProfile }: { row: DmRow | null; onClose(): void; onProfile(user: User): void }) {
  const row = useLastValue(shown);
  const [step, setStep] = useState<Step>('menu');
  const service = useMessageService();
  const channel = useGuildStore((s) => (row ? s.channels[row.id] : undefined));
  const read = useReadStateStore((s) => (row ? s.byChannel[row.id] : undefined));
  const muted = useNotificationSettingsStore((s) => (row ? isChannelMuted(s.byScope[DM_SCOPE], row.id, Date.now()) : false));
  const pins = useSessionStore((s) => s.settings.pinned_dm_channel_ids) ?? [];

  const close = () => {
    setStep('menu');
    onClose();
  };
  const done = (run: () => unknown) => () => {
    close();
    void run();
  };
  if (!row) return <Sheet visible={false} closeLabel="Close conversation menu" onClose={close}>{null}</Sheet>;

  const items = buildDmMenu({
    group: row.group,
    hasUnread: isUnread(channel?.last_message_id ?? undefined, read?.lastReadId) || (read?.mentionCount ?? 0) > 0,
    muted,
    hasPeer: row.peer !== null,
    pinned: pins.includes(row.id),
    pinFull: isPinFull(pins, row.id, MAX_PINNED_DMS),
  });
  const handlers: Record<string, () => void> = {
    markRead: done(() => channel?.last_message_id && service.markRead(row.id, channel.last_message_id)),
    pin: done(() => pinConversation(row.id, true)),
    unpin: done(() => pinConversation(row.id, false)),
    profile: () => {
      close();
      if (row.peer) onProfile(row.peer);
    },
    unmute: done(() => muteConversation(row.id, undefined)),
    close: done(() => closeConversation(row.id)),
    leave: () => setStep('leave'),
  };

  return (
    <Sheet visible={shown !== null} title={step === 'mute' ? 'Mute conversation' : row.title} closeLabel="Close conversation menu" onClose={close}>
      {step === 'menu' &&
        items.map((entry) => {
          if (entry.kind === 'submenu') return <SheetOption key={entry.id} label={entry.label} icon={<Ionicons name={ICONS.mute!} size={20} color={theme.text} />} onPress={() => setStep('mute')} />;
          // The group settings page is not on mobile yet, so its entry is left out rather than shown dead.
          if (entry.kind !== 'item' || entry.id === 'settings') return null;
          return (
            <SheetOption
              key={entry.id}
              label={entry.disabled && entry.id === 'pin' ? `Pin conversation (limit ${MAX_PINNED_DMS})` : entry.label}
              danger={entry.danger}
              icon={<Ionicons name={ICONS[entry.id] ?? 'ellipse-outline'} size={20} color={entry.danger ? theme.danger : theme.text} />}
              onPress={entry.disabled ? () => undefined : (handlers[entry.id] ?? close)}
            />
          );
        })}
      {step === 'mute' && MUTE_DURATIONS.map((d) => <SheetOption key={d.id} label={d.label} onPress={done(() => muteConversation(row.id, d.seconds))} />)}
      {step === 'leave' && <SheetConfirm body="You will stop receiving messages from this group." confirmLabel="Leave group" onConfirm={done(() => leaveGroup(row.id))} onCancel={() => setStep('menu')} />}
    </Sheet>
  );
}
