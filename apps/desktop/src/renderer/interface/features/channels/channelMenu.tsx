import { BellSlash, Check, Copy, Gear, Hash, Trash } from '@phosphor-icons/react';
import { usePrefsStore } from '@renderer/application/stores/prefsStore';
import type { Dialog, SettingsTarget } from '@renderer/application/stores/uiStore';
import { Permission } from '@shared/contracts/permissions';
import type { Channel } from '@shared/contracts/rest';
import { attempt, copyText } from '../../app/actions';
import { getRuntime } from '../../app/runtime';
import { can } from '../../shared/hooks/usePermissions';
import type { MenuEntry } from '../../shared/ui/Menu';

interface Handlers {
  openDialog: (d: Dialog | null) => void;
  openSettings: (t: SettingsTarget | null) => void;
  markRead: () => void;
}

/** Context menu for a channel row. Not a hook: reads store state at open time. */
export function ChannelContextMenuEntries(channel: Channel, perms: bigint, h: Handlers): MenuEntry[] {
  const muted = usePrefsStore.getState().mutedChannels[channel.id];
  const entries: MenuEntry[] = [
    { kind: 'item', label: 'Mark as read', icon: <Check size={16} />, onSelect: h.markRead },
    {
      kind: 'item',
      label: muted ? 'Unmute channel' : 'Mute channel',
      icon: <BellSlash size={16} />,
      onSelect: () => usePrefsStore.getState().toggleMap('mutedChannels', channel.id),
    },
    { kind: 'item', label: 'Copy channel ID', icon: <Copy size={16} />, onSelect: () => void copyText(channel.id, 'Channel ID copied') },
  ];
  if (channel.guild_id && can(perms, Permission.MANAGE_CHANNELS)) {
    entries.push({ kind: 'separator' });
    entries.push({ kind: 'item', label: 'Edit channel', icon: <Gear size={16} />, onSelect: () => h.openSettings({ kind: 'channel', channelId: channel.id, tab: 'overview' }) });
    entries.push({
      kind: 'item',
      label: 'Create channel here',
      icon: <Hash size={16} />,
      onSelect: () => h.openDialog({ kind: 'createChannel', guildId: channel.guild_id!, parentId: channel.parent_id ?? null }),
    });
    entries.push({
      kind: 'item',
      label: 'Delete channel',
      icon: <Trash size={16} />,
      danger: true,
      onSelect: () =>
        h.openDialog({
          kind: 'confirm',
          title: `Delete #${channel.name}?`,
          body: 'Messages in this channel will be lost for everyone.',
          confirmLabel: 'Delete channel',
          danger: true,
          onConfirm: async () => void (await attempt(() => getRuntime().api.deleteChannel(channel.id), 'Could not delete channel')),
        }),
    });
  }
  return entries;
}
