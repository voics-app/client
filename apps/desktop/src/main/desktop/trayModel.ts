/** Tray context menu as data, so the rules are testable without Electron. */
import type { ActivityCounts, TrayCommand, VoiceState } from '../../shared/ipc';

export type TrayAction = TrayCommand | 'open' | 'quit';

export type TrayMenuItem =
  | { kind: 'item'; id: string; label: string; enabled?: boolean; checked?: boolean; action?: TrayAction }
  | { kind: 'separator' };

export function buildTrayMenu(input: { brand: string; version: string; activity: ActivityCounts; voice: VoiceState }): TrayMenuItem[] {
  const { activity, voice } = input;
  const parts: string[] = [];
  if (activity.mentions > 0) parts.push(`${activity.mentions} mention${activity.mentions === 1 ? '' : 's'}`);
  if (activity.unread > 0) parts.push(`${activity.unread} unread`);
  return [
    { kind: 'item', id: 'open', label: `Open ${input.brand}`, action: 'open' },
    { kind: 'item', id: 'unread', label: parts.length ? parts.join(', ') : 'No unread messages', enabled: false },
    { kind: 'separator' },
    { kind: 'item', id: 'mute', label: 'Mute', checked: voice.muted || voice.deafened, enabled: !voice.deafened, action: 'toggleMute' },
    { kind: 'item', id: 'deafen', label: 'Deafen', checked: voice.deafened, action: 'toggleDeafen' },
    { kind: 'separator' },
    { kind: 'item', id: 'version', label: `Version ${input.version}`, enabled: false },
    { kind: 'item', id: 'quit', label: `Quit ${input.brand}`, action: 'quit' },
  ];
}
