import { BellRinging, BellSlash, CaretDoubleUp, CaretDown, Check, Copy, CopySimple, Gear, Hash, Link, PushPin, Trash, UserPlus } from '@phosphor-icons/react';
import { useGuildStore } from '@renderer/application/stores/guildStore';
import { useNotificationSettingsStore } from '@renderer/application/stores/notificationSettingsStore';
import { usePrefsStore } from '@renderer/application/stores/prefsStore';
import type { Dialog, SettingsTarget } from '@renderer/application/stores/uiStore';
import { buildCategoryMenu, buildChannelMenu, channelLink, duplicateChannelBody } from '@renderer/domain/channelMenuModel';
import type { MenuItemModel } from '@renderer/domain/menuModel';
import { isChannelMuted, MUTE_DURATIONS, scopeKey } from '@renderer/domain/notificationSettings';
import { isPinFull, MAX_PINNED_PER_GUILD } from '@renderer/domain/pins';
import { Permission } from '@shared/contracts/permissions';
import type { Channel } from '@shared/contracts/rest';
import { attempt, copyText } from '../../app/actions';
import { canStep, moveCategoryStep, moveChannelStep } from '../../app/channelOrderActions';
import { muteChannel } from '../../app/notificationActions';
import { pinnedIdsIn, setChannelPinned } from '../../app/pinActions';
import { getRuntime } from '../../app/runtime';
import { can } from '../../shared/hooks/usePermissions';
import type { MenuEntry } from '../../shared/ui/Menu';
import { toMenuEntries } from '../../shared/ui/menuAdapter';

interface Handlers {
  openDialog: (d: Dialog | null) => void;
  openSettings: (t: SettingsTarget | null) => void;
  markRead: () => void;
  hasUnread: boolean;
}

const ICONS = {
  markRead: <Check size={16} />,
  invite: <UserPlus size={16} />,
  copyLink: <Link size={16} />,
  mute: <BellSlash size={16} />,
  unmute: <BellRinging size={16} />,
  notifications: <BellRinging size={16} />,
  edit: <Gear size={16} />,
  duplicate: <CopySimple size={16} />,
  create: <Hash size={16} />,
  delete: <Trash size={16} />,
  copyId: <Copy size={16} />,
  pin: <PushPin size={16} />,
  unpin: <PushPin size={16} weight="fill" />,
  toggleCollapse: <CaretDown size={16} />,
  collapseAll: <CaretDoubleUp size={16} />,
};

/** Whether this channel or category has its own active mute (the guild mute is handled by the server menu). */
function ownMute(channel: Channel): boolean {
  const settings = useNotificationSettingsStore.getState().byScope[scopeKey(channel.guild_id)];
  return isChannelMuted(settings && { ...settings, muted: false }, channel.id, Date.now());
}

function applyMuteChoice(channel: Channel, it: MenuItemModel): void {
  if (it.id === 'unmute') void muteChannel(channel.guild_id ?? null, channel.id, undefined);
  else if (it.id === 'muteFor') void muteChannel(channel.guild_id ?? null, channel.id, MUTE_DURATIONS.find((d) => d.id === it.arg)?.seconds ?? null);
}

/** Context menu for a channel row. Not a hook: reads store state at open time. */
export function ChannelContextMenuEntries(channel: Channel, perms: bigint, h: Handlers): MenuEntry[] {
  const pins = channel.guild_id ? pinnedIdsIn(channel.guild_id) : [];
  const model = buildChannelMenu({
    pinned: pins.includes(channel.id),
    pinFull: isPinFull(pins, channel.id, MAX_PINNED_PER_GUILD),
    inGuild: Boolean(channel.guild_id),
    canInvite: can(perms, Permission.CREATE_INSTANT_INVITE),
    canManage: can(perms, Permission.MANAGE_CHANNELS),
    hasUnread: h.hasUnread,
    muted: ownMute(channel),
    developerMode: usePrefsStore.getState().developerMode,
    canMoveUp: !channel.guild_id || canStep(channel.guild_id, channel.id, 'channel', -1),
    canMoveDown: !channel.guild_id || canStep(channel.guild_id, channel.id, 'channel', 1),
  });
  return toMenuEntries(
    model,
    (it) => {
      switch (it.id) {
        case 'markRead': return h.markRead();
        case 'pin': return void setChannelPinned(channel.guild_id!, channel.id, true);
        case 'unpin': return void setChannelPinned(channel.guild_id!, channel.id, false);
        case 'invite': return h.openDialog({ kind: 'invite', guildId: channel.guild_id!, channelId: channel.id });
        case 'copyLink': return void copyText(channelLink(channel.guild_id, channel.id), 'Channel link copied');
        case 'mute':
        case 'muteFor':
        case 'unmute': return applyMuteChoice(channel, it);
        case 'notifications': return h.openDialog({ kind: 'notifications', targetId: channel.id, name: channel.name ?? 'channel' });
        case 'moveUp': return void moveChannelStep(channel.guild_id!, channel.id, -1);
        case 'moveDown': return void moveChannelStep(channel.guild_id!, channel.id, 1);
        case 'edit': return h.openSettings({ kind: 'channel', channelId: channel.id, tab: 'overview' });
        case 'duplicate':
          return void attempt(async () => {
            const copy = await getRuntime().api.createChannel(channel.guild_id!, duplicateChannelBody(channel));
            useGuildStore.getState().upsertChannel(copy);
          }, 'Could not duplicate channel');
        case 'create': return h.openDialog({ kind: 'createChannel', guildId: channel.guild_id!, parentId: channel.parent_id ?? null });
        case 'delete':
          return h.openDialog({
            kind: 'confirm',
            title: `Delete #${channel.name}?`,
            body: 'Messages in this channel will be lost for everyone.',
            confirmLabel: 'Delete channel',
            danger: true,
            onConfirm: async () => void (await attempt(() => getRuntime().api.deleteChannel(channel.id), 'Could not delete channel')),
          });
        case 'copyId': return void copyText(channel.id, 'Channel ID copied');
      }
    },
    ICONS,
  );
}

/** Context menu for a category header. `siblings` are all category ids of the server (for collapse all). */
export function CategoryContextMenuEntries(category: Channel, children: Channel[], siblings: string[], perms: bigint, h: Handlers & { guildId: string }): MenuEntry[] {
  const prefs = usePrefsStore.getState();
  const collapsed = Boolean(prefs.collapsedCategories[category.id]);
  const model = buildCategoryMenu({
    canManage: can(perms, Permission.MANAGE_CHANNELS),
    hasUnread: h.hasUnread,
    muted: ownMute(category),
    developerMode: usePrefsStore.getState().developerMode,
    collapsed,
    hasOtherCategories: siblings.length > 1,
    canMoveUp: canStep(h.guildId, category.id, 'category', -1),
    canMoveDown: canStep(h.guildId, category.id, 'category', 1),
  });
  return toMenuEntries(
    model,
    (it) => {
      switch (it.id) {
        case 'markRead': return h.markRead();
        case 'toggleCollapse': return usePrefsStore.getState().setCollapsed([category.id], !collapsed);
        case 'collapseAll': return usePrefsStore.getState().setCollapsed(siblings, true);
        case 'mute':
        case 'muteFor':
        case 'unmute': return applyMuteChoice(category, it);
        case 'notifications': return h.openDialog({ kind: 'notifications', targetId: category.id, name: category.name ?? 'category', category: true });
        case 'moveUp': return void moveCategoryStep(h.guildId, category.id, -1);
        case 'moveDown': return void moveCategoryStep(h.guildId, category.id, 1);
        case 'edit': return h.openSettings({ kind: 'channel', channelId: category.id, tab: 'overview' });
        case 'create': return h.openDialog({ kind: 'createChannel', guildId: h.guildId, parentId: category.id });
        case 'delete':
          return h.openDialog({
            kind: 'confirm',
            title: `Delete ${category.name}?`,
            body: children.length > 0 ? `${children.length} channel${children.length === 1 ? '' : 's'} in this category will be moved out of it, not deleted.` : 'This category is empty.',
            confirmLabel: 'Delete category',
            danger: true,
            onConfirm: async () =>
              void (await attempt(async () => {
                // The API has no foreign key on parent_id: move children out first so they do not vanish from the list.
                for (const c of children) useGuildStore.getState().upsertChannel(await getRuntime().api.updateChannel(c.id, { parent_id: null }));
                await getRuntime().api.deleteChannel(category.id);
              }, 'Could not delete category')),
          });
        case 'copyId': return void copyText(category.id, 'Category ID copied');
      }
    },
    ICONS,
  );
}
