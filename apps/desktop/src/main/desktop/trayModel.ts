import { createI18n } from '@discordy/core/domain/i18n';
/** Tray context menu as data, so the rules are testable without Electron. */
import type { ActivityCounts, TrayCommand, VoiceState } from '../../shared/ipc';

export type TrayAction = TrayCommand | 'open' | 'quit' | 'checkUpdates';

export type TrayMenuItem =
  | { kind: 'item'; id: string; label: string; enabled?: boolean; checked?: boolean; action?: TrayAction }
  | { kind: 'separator' };

export function buildTrayMenu(input: { brand: string; version: string; activity: ActivityCounts; voice: VoiceState; locale?: string }): TrayMenuItem[] {
  const { activity, voice } = input;
  const intl = createI18n(input.locale);
  const parts: string[] = [];
  if (activity.mentions > 0) parts.push(intl.t('native.mentions', { count: activity.mentions }));
  if (activity.unread > 0) parts.push(intl.t('native.unread', { count: activity.unread }));
  return [
    { kind: 'item', id: 'open', label: intl.t('native.open', { brand: input.brand }), action: 'open' },
    { kind: 'item', id: 'unread', label: parts.length ? new Intl.ListFormat(intl.locale, { type: 'unit' }).format(parts) : intl.t('native.noUnread'), enabled: false },
    { kind: 'separator' },
    { kind: 'item', id: 'mute', label: intl.t('media.mute'), checked: voice.muted || voice.deafened, enabled: !voice.deafened, action: 'toggleMute' },
    { kind: 'item', id: 'deafen', label: intl.t('native.deafen'), checked: voice.deafened, action: 'toggleDeafen' },
    { kind: 'separator' },
    { kind: 'item', id: 'version', label: intl.t('native.version', { version: input.version }), enabled: false },
    { kind: 'item', id: 'updates', label: intl.t('native.updates'), action: 'checkUpdates' },
    { kind: 'item', id: 'quit', label: intl.t('native.quit', { brand: input.brand }), action: 'quit' },
  ];
}
