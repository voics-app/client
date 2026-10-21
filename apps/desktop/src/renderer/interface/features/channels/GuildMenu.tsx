import { CaretDoubleUp, Check, FolderPlus, Gear, Hash, SignOut, Trash, UserPlus } from '@phosphor-icons/react';
import { useGuildStore } from '@renderer/application/stores/guildStore';
import { usePrefsStore } from '@renderer/application/stores/prefsStore';
import { useSessionStore } from '@renderer/application/stores/sessionStore';
import { useUiStore } from '@renderer/application/stores/uiStore';
import { Permission } from '@shared/contracts/permissions';
import { ChannelType } from '@shared/contracts/rest';
import { attempt, deleteGuild, leaveGuild, markGuildRead } from '../../app/actions';
import { can, useGuildPermissions } from '../../shared/hooks/usePermissions';
import { Menu, type MenuEntry } from '../../shared/ui/Menu';

export function useGuildMenuEntries(guildId: string): MenuEntry[] {
  const perms = useGuildPermissions(guildId);
  const guild = useGuildStore((s) => s.guilds[guildId]);
  const me = useSessionStore((s) => s.user?.id);
  const ui = useUiStore.getState();
  if (!guild) return [];
  const isOwner = guild.owner_id === me;
  const firstChannel = Object.values(useGuildStore.getState().channels).find((c) => c.guild_id === guildId && c.type === ChannelType.GUILD_TEXT);
  const categoryIds = Object.values(useGuildStore.getState().channels)
    .filter((c) => c.guild_id === guildId && c.type === ChannelType.GUILD_CATEGORY)
    .map((c) => c.id);
  const entries: MenuEntry[] = [
    { kind: 'item', label: 'Mark as read', icon: <Check size={16} />, onSelect: () => markGuildRead(guildId) },
    {
      kind: 'item',
      label: 'Collapse all categories',
      icon: <CaretDoubleUp size={16} />,
      disabled: categoryIds.length === 0,
      onSelect: () => usePrefsStore.getState().setCollapsed(categoryIds, true),
    },
    {
      kind: 'item',
      label: 'Invite people',
      icon: <UserPlus size={16} />,
      disabled: !can(perms, Permission.CREATE_INSTANT_INVITE) || !firstChannel,
      onSelect: () => firstChannel && ui.openDialog({ kind: 'invite', guildId, channelId: firstChannel.id }),
    },
  ];
  const canManageGuild = can(perms, Permission.MANAGE_GUILD) || can(perms, Permission.MANAGE_ROLES) || can(perms, Permission.MANAGE_CHANNELS);
  if (canManageGuild) {
    entries.push({ kind: 'separator' });
    entries.push({ kind: 'item', label: 'Server settings', icon: <Gear size={16} />, onSelect: () => ui.openSettings({ kind: 'server', guildId, tab: 'overview' }) });
  }
  if (can(perms, Permission.MANAGE_CHANNELS)) {
    entries.push({ kind: 'item', label: 'Create channel', icon: <Hash size={16} />, onSelect: () => ui.openDialog({ kind: 'createChannel', guildId, parentId: null }) });
    entries.push({ kind: 'item', label: 'Create category', icon: <FolderPlus size={16} />, onSelect: () => ui.openDialog({ kind: 'createChannel', guildId, parentId: null, type: ChannelType.GUILD_CATEGORY }) });
  }
  entries.push({ kind: 'separator' });
  if (isOwner) {
    entries.push({
      kind: 'item',
      label: 'Delete server',
      icon: <Trash size={16} />,
      danger: true,
      onSelect: () =>
        ui.openDialog({
          kind: 'confirm',
          title: `Delete ${guild.name}?`,
          body: 'This permanently deletes the server, its channels and messages for everyone. This cannot be undone.',
          confirmLabel: 'Delete server',
          danger: true,
          onConfirm: async () => void (await attempt(() => deleteGuild(guildId), 'Could not delete server')),
        }),
    });
  } else {
    entries.push({
      kind: 'item',
      label: 'Leave server',
      icon: <SignOut size={16} />,
      danger: true,
      onSelect: () =>
        ui.openDialog({
          kind: 'confirm',
          title: `Leave ${guild.name}?`,
          body: 'You will need a new invite to rejoin.',
          confirmLabel: 'Leave server',
          danger: true,
          onConfirm: async () => void (await attempt(() => leaveGuild(guildId), 'Could not leave server')),
        }),
    });
  }
  return entries;
}

export function GuildContextMenu({ guildId, anchor, onClose }: { guildId: string; anchor: { x: number; y: number } | null; onClose: () => void }) {
  const entries = useGuildMenuEntries(guildId);
  return <Menu open={anchor !== null} x={anchor?.x ?? 0} y={anchor?.y ?? 0} entries={entries} onClose={onClose} minWidth={220} />;
}
