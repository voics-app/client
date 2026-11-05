import type { GuildMeta } from '@discordy/core/application/stores/guildStore';
import type { ChatMessage } from '@discordy/core/application/stores/messageStore';
import { Permission } from '@discordy/core/contracts/permissions';
import type { Channel, GuildMember } from '@discordy/core/contracts/rest';
import { idsOf } from '@discordy/core/domain/menuModel';
import { buildMessageMenu } from '@discordy/core/domain/messageMenuModel';
import { computeChannelPermissions, hasPermission } from '@discordy/core/domain/permissions';
import { DEFAULT_QUICK_REACTIONS } from '@discordy/core/domain/quickReactions';

export interface ChannelAccess {
  canSend: boolean;
  canReact: boolean;
  canReadHistory: boolean;
  canAttach: boolean;
  canManageMessages: boolean;
  /** Server-stored delivery. Ephemeral and P2P channels need the encryption core, which comes to mobile later. */
  standard: boolean;
}

export interface ChannelAccessInput {
  guild: GuildMeta;
  channel: Channel;
  members: Record<string, GuildMember> | undefined;
  userId: string;
}

/** What the user may do in a server channel, from the same permission algorithm the desktop client uses. */
export function channelAccess({ guild, channel, members, userId }: ChannelAccessInput): ChannelAccess {
  const ctx = { guildId: guild.id, ownerId: guild.owner_id, userId, memberRoleIds: members?.[userId]?.roles ?? [], roles: guild.roles };
  const perms = computeChannelPermissions(ctx, channel.permission_overwrites ?? []);
  const can = (bit: bigint) => hasPermission(perms, bit);
  return {
    canSend: can(Permission.SEND_MESSAGES),
    canReact: can(Permission.ADD_REACTIONS),
    canReadHistory: can(Permission.READ_MESSAGE_HISTORY),
    canAttach: can(Permission.ATTACH_FILES),
    canManageMessages: can(Permission.MANAGE_MESSAGES),
    standard: channel.delivery_mode === 'standard',
  };
}

/** In a DM every participant may send, react and read; there are no roles to moderate with. */
export function dmAccess(channel: Channel): ChannelAccess {
  return { canSend: true, canReact: true, canReadHistory: true, canAttach: true, canManageMessages: false, standard: channel.delivery_mode === 'standard' };
}

export interface MessageActions {
  reply: boolean;
  edit: boolean;
  delete: boolean;
  react: boolean;
  /** Copy Text and Select Text: only for messages that have text. */
  copyText: boolean;
}

const NONE: MessageActions = { reply: false, edit: false, delete: false, react: false, copyText: false };

/** The actions to offer on one message, read from core's message menu so mobile and desktop agree. */
export function messageActions(message: ChatMessage, access: ChannelAccess, userId: string): MessageActions {
  if (message.localState) return NONE;
  const hasText = (message.content ?? '').trim() !== '';
  const ids = new Set(
    idsOf(
      buildMessageMenu(
        {
          isMine: message.author.id === userId,
          standard: access.standard,
          canReact: access.canReact,
          canManageMessages: access.canManageMessages,
          canCreateThread: false,
          forwardSupported: false,
          canSpeak: false,
          hasText,
          pinned: message.pinned,
          selection: '',
          canAddEmoji: false,
          quick: DEFAULT_QUICK_REACTIONS,
        },
        { kind: 'message' },
      ),
    ),
  );
  return { reply: access.canSend && ids.has('reply'), edit: ids.has('edit'), delete: ids.has('delete'), react: ids.has('addReaction'), copyText: ids.has('copyText') };
}
