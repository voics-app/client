import { BRAND } from '@shared/brand';
import type { Channel } from '@discordy/core/contracts/rest';
import { item, sep, tidy, type MenuModel } from '@discordy/core/domain/menuModel';
import { MUTE_DURATIONS } from '@discordy/core/domain/notificationSettings';

export interface ChannelMenuContext {
  /** False for DM channels: no invite, link, duplicate or management entries. */
  inGuild: boolean;
  canInvite: boolean;
  canManage: boolean;
  hasUnread: boolean;
  muted: boolean;
  /** Keyboard alternative to dragging (MANAGE_CHANNELS); the entry is disabled at the edge of the list. */
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  /** Developer mode (Settings, Advanced): shows the Copy ID entry. */
  developerMode?: boolean;
  pinned?: boolean;
  /** Ten channels of this server are already pinned: Pin is shown disabled. */
  pinFull?: boolean;
}

export interface CategoryMenuContext {
  canManage: boolean;
  hasUnread: boolean;
  muted: boolean;
  collapsed: boolean;
  /** More than one category exists, so "collapse all" is meaningful. */
  hasOtherCategories: boolean;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  developerMode?: boolean;
}

function muteEntry(noun: 'Channel' | 'Category', muted: boolean): MenuModel {
  if (muted) return item('unmute', `Unmute ${noun}`);
  return { kind: 'submenu', id: 'mute', label: `Mute ${noun}`, items: MUTE_DURATIONS.map((d) => item('muteFor', d.label, { arg: d.id })) };
}

export function buildChannelMenu(ctx: ChannelMenuContext): MenuModel[] {
  const manage = ctx.inGuild && ctx.canManage;
  return tidy([
    item('markRead', 'Mark As Read', { disabled: !ctx.hasUnread }),
    ...(ctx.inGuild ? [ctx.pinned ? item('unpin', 'Unpin Channel') : item('pin', 'Pin Channel', { disabled: ctx.pinFull === true })] : []),
    sep(),
    ...(ctx.inGuild && ctx.canInvite ? [item('invite', 'Invite People')] : []),
    ...(ctx.inGuild ? [item('copyLink', 'Copy Link')] : []),
    muteEntry('Channel', ctx.muted),
    item('notifications', 'Notification Settings'),
    ...(manage ? [sep(), item('moveUp', 'Move Up', { disabled: ctx.canMoveUp === false }), item('moveDown', 'Move Down', { disabled: ctx.canMoveDown === false }), item('edit', 'Edit Channel'), item('duplicate', 'Duplicate Channel'), item('create', 'Create Channel'), item('delete', 'Delete Channel', { danger: true })] : []),
    ...(ctx.developerMode ? [sep(), item('copyId', 'Copy Channel ID')] : []),
  ]);
}

export function buildCategoryMenu(ctx: CategoryMenuContext): MenuModel[] {
  return tidy([
    item('markRead', 'Mark As Read', { disabled: !ctx.hasUnread }),
    sep(),
    item('toggleCollapse', ctx.collapsed ? 'Expand Category' : 'Collapse Category'),
    ...(ctx.hasOtherCategories ? [item('collapseAll', 'Collapse All Categories')] : []),
    muteEntry('Category', ctx.muted),
    item('notifications', 'Notification Settings'),
    ...(ctx.canManage ? [sep(), item('moveUp', 'Move Up', { disabled: ctx.canMoveUp === false }), item('moveDown', 'Move Down', { disabled: ctx.canMoveDown === false }), item('edit', 'Edit Category'), item('create', 'Create Channel'), item('delete', 'Delete Category', { danger: true })] : []),
    ...(ctx.developerMode ? [sep(), item('copyId', 'Copy Category ID')] : []),
  ]);
}

export function channelLink(guildId: string | null | undefined, channelId: string, messageId?: string): string {
  return `${BRAND.protocolScheme}://channels/${guildId ?? '@me'}/${channelId}${messageId ? `/${messageId}` : ''}`;
}

/** Body for "Duplicate channel": same type, topic, slowmode, overwrites and parent under a new name. */
export function duplicateChannelBody(channel: Channel) {
  return {
    name: `${channel.name ?? 'channel'}-copy`.slice(0, 100),
    type: channel.type as number,
    parent_id: channel.parent_id ?? null,
    topic: channel.topic ?? null,
    nsfw: channel.nsfw ?? false,
    rate_limit_per_user: channel.rate_limit_per_user ?? 0,
    permission_overwrites: (channel.permission_overwrites ?? []).map((o) => ({ ...o })),
    delivery_mode: channel.delivery_mode,
    ...(channel.user_limit !== undefined ? { user_limit: channel.user_limit } : {}),
    ...(channel.bitrate !== undefined ? { bitrate: channel.bitrate } : {}),
    ...(channel.voice_region ? { voice_region: channel.voice_region } : {}),
  };
}
