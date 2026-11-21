import { useI18n } from '../../shared/i18n';
import { BellRinging, BellSlash, CaretDoubleUp, Check, Copy, FolderPlus, Gear, Hash, Shield, SignOut, Trash, UserPlus } from '@phosphor-icons/react';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { usePrefsStore } from '@discordy/core/application/stores/prefsStore';
import { useNotificationSettingsStore } from '@discordy/core/application/stores/notificationSettingsStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import { isGuildMuted, MUTE_DURATIONS, scopeKey } from '@discordy/core/domain/notificationSettings';
import { canOpenServerSettings, serverSettingsTabs } from '@discordy/core/domain/serverSettings';
import { Permission } from '@discordy/core/contracts/permissions';
import { ChannelType } from '@discordy/core/contracts/rest';
import { attempt, copyText, leaveGuild, markGuildRead } from '../../app/actions';
import { muteGuild, setGuildToggles } from '../../app/notificationActions';
import { confirmDeleteServer } from '../settings/server/deleteServer';
import { can, useGuildPermissions } from '../../shared/hooks/usePermissions';
import { Menu, type MenuEntry } from '../../shared/ui/Menu';

export function useGuildMenuEntries(guildId: string): MenuEntry[] {
  const { t: msg, catalogText } = useI18n();
  const perms = useGuildPermissions(guildId);
  const guild = useGuildStore((s) => s.guilds[guildId]);
  const me = useSessionStore((s) => s.user?.id);
  const settings = useNotificationSettingsStore((s) => s.byScope[scopeKey(guildId)]);
  const ui = useUiStore.getState();
  if (!guild) return [];
  const muted = isGuildMuted(settings, Date.now());
  const isOwner = guild.owner_id === me;
  const firstChannel = Object.values(useGuildStore.getState().channels).find((c) => c.guild_id === guildId && c.type === ChannelType.GUILD_TEXT);
  const categoryIds = Object.values(useGuildStore.getState().channels)
    .filter((c) => c.guild_id === guildId && c.type === ChannelType.GUILD_CATEGORY)
    .map((c) => c.id);
  const entries: MenuEntry[] = [
    { kind: 'item', label: msg("chat.markRead"), icon: <Check size={16} />, onSelect: () => markGuildRead(guildId) },
    muted
      ? { kind: 'item', label: msg("settings.guildmenu.unmute.server"), icon: <BellRinging size={16} />, onSelect: () => void muteGuild(guildId, undefined) }
      : {
          kind: 'submenu',
          label: msg("settings.guildmenu.mute.server"),
          icon: <BellSlash size={16} />,
          entries: MUTE_DURATIONS.map((d) => ({ kind: 'item' as const, label: catalogText(d.label), onSelect: () => void muteGuild(guildId, d.seconds) })),
        },
    { kind: 'item', label: msg("notifications.title"), icon: <BellRinging size={16} />, onSelect: () => ui.openDialog({ kind: 'guildNotifications', guildId }) },
    { kind: 'item', label: msg("notifications.hideMuted"), checked: settings?.hide_muted_channels ?? false, onSelect: () => void setGuildToggles(guildId, { hide_muted_channels: !settings?.hide_muted_channels }) },
    { kind: 'item', label: msg("settings.guildmenu.privacy.settings"), icon: <Shield size={16} />, onSelect: () => ui.openSettings({ kind: 'user', tab: 'privacy' }) },
    {
      kind: 'item',
      label: msg("settings.guildmenu.collapse.all.categories"),
      icon: <CaretDoubleUp size={16} />,
      disabled: categoryIds.length === 0,
      onSelect: () => usePrefsStore.getState().setCollapsed(categoryIds, true),
    },
    {
      kind: 'item',
      label: msg("settings.guildmenu.invite.people"),
      icon: <UserPlus size={16} />,
      disabled: !can(perms, Permission.CREATE_INSTANT_INVITE) || !firstChannel,
      onSelect: () => firstChannel && ui.openDialog({ kind: 'invite', guildId, channelId: firstChannel.id }),
    },
  ];
  if (canOpenServerSettings(perms)) {
    entries.push({ kind: 'separator' });
    entries.push({ kind: 'item', label: msg("settings.serverTitle"), icon: <Gear size={16} />, onSelect: () => ui.openSettings({ kind: 'server', guildId, tab: serverSettingsTabs(perms).find((tab) => tab.show)?.id ?? 'members' }) });
  }
  if (can(perms, Permission.MANAGE_CHANNELS)) {
    entries.push({ kind: 'item', label: msg("settings.dialoghost.create.channel"), icon: <Hash size={16} />, onSelect: () => ui.openDialog({ kind: 'createChannel', guildId, parentId: null }) });
    entries.push({ kind: 'item', label: msg("settings.dialoghost.create.category"), icon: <FolderPlus size={16} />, onSelect: () => ui.openDialog({ kind: 'createChannel', guildId, parentId: null, type: ChannelType.GUILD_CATEGORY }) });
  }
  entries.push({ kind: 'separator' });
  if (isOwner) {
    entries.push({
      kind: 'item',
      label: msg("settings.deleteServer"),
      icon: <Trash size={16} />,
      danger: true,
      onSelect: () => confirmDeleteServer(guildId),
    });
  } else {
    entries.push({
      kind: 'item',
      label: msg("settings.guildmenu.leave.server"),
      icon: <SignOut size={16} />,
      danger: true,
      onSelect: () =>
        ui.openDialog({
          kind: 'confirm',
          title: msg('group.confirmLeave', { name: guild.name }),
          body: msg("settings.guildmenu.you.will.need.a.new.invite.to.rejoin"),
          confirmLabel: msg("settings.guildmenu.leave.server"),
          danger: true,
          onConfirm: async () => void (await attempt(() => leaveGuild(guildId), msg("settings.guildmenu.could.not.leave.server"))),
        }),
    });
  }
  entries.push({ kind: 'separator' }, { kind: 'item', label: msg("settings.guildmenu.copy.server.id"), icon: <Copy size={16} />, onSelect: () => void copyText(guildId, msg("settings.guildmenu.server.id.copied")) });
  return entries;
}

export function GuildContextMenu({ guildId, anchor, onClose, leading = [] }: { guildId: string; anchor: { x: number; y: number } | null; onClose: () => void; leading?: MenuEntry[] }) {
  const entries = [...leading, ...useGuildMenuEntries(guildId)];
  return <Menu open={anchor !== null} x={anchor?.x ?? 0} y={anchor?.y ?? 0} entries={entries} onClose={onClose} minWidth={220} />;
}
