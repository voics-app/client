import type { GuildMeta } from '@discordy/core/application/stores/guildStore';
import type { ChatMessage } from '@discordy/core/application/stores/messageStore';
import { Permission } from '@discordy/core/contracts/permissions';
import type { Channel, GuildMember } from '@discordy/core/contracts/rest';
import { isThread } from '@discordy/core/domain/threads';
import { canForward } from '@discordy/core/domain/forward';
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
  /** Start a thread from a message: Create Public Threads, in a channel that is not itself a thread. */
  canCreateThread: boolean;
  /** Manage Threads: write in a locked thread. */
  canManageThreads: boolean;
  /** Use Application Commands: slash commands in the composer. */
  canUseCommands: boolean;
  /** Server-stored delivery. Ephemeral and P2P channels need the encryption core, which comes to mobile later. */
  standard: boolean;
}

export interface ChannelAccessInput {
  guild: GuildMeta;
  channel: Channel;
  members: Record<string, GuildMember> | undefined;
  userId: string;
  /** For a thread: the channel it belongs to, whose permission overwrites apply to it. */
  parent?: Channel | undefined;
}

/** What the user may do in a server channel, from the same permission algorithm the desktop client uses. */
export function channelAccess({ guild, channel, members, userId, parent }: ChannelAccessInput): ChannelAccess {
  const ctx = { guildId: guild.id, ownerId: guild.owner_id, userId, memberRoleIds: members?.[userId]?.roles ?? [], roles: guild.roles };
  const thread = isThread(channel);
  const perms = computeChannelPermissions(ctx, (thread ? parent : channel)?.permission_overwrites ?? []);
  const can = (bit: bigint) => hasPermission(perms, bit);
  return {
    canSend: can(thread ? Permission.SEND_MESSAGES_IN_THREADS : Permission.SEND_MESSAGES),
    canReact: can(Permission.ADD_REACTIONS),
    canReadHistory: can(Permission.READ_MESSAGE_HISTORY),
    canAttach: can(Permission.ATTACH_FILES),
    canManageMessages: can(Permission.MANAGE_MESSAGES),
    canCreateThread: !thread && can(Permission.CREATE_PUBLIC_THREADS),
    canManageThreads: can(Permission.MANAGE_THREADS),
    canUseCommands: can(Permission.USE_APPLICATION_COMMANDS),
    standard: channel.delivery_mode === 'standard',
  };
}

/** In a DM every participant may send, react and read; there are no roles to moderate with. */
export function dmAccess(channel: Channel): ChannelAccess {
  return { canSend: true, canReact: true, canReadHistory: true, canAttach: true, canManageMessages: false, canCreateThread: false, canManageThreads: false, canUseCommands: true, standard: channel.delivery_mode === 'standard' };
}

export interface MessageActions {
  reply: boolean;
  edit: boolean;
  delete: boolean;
  react: boolean;
  /** Copy Text and Select Text: only for messages that have text. */
  copyText: boolean;
  copyLink: boolean;
  markUnread: boolean;
  /** Pin or unpin: only for people with Manage Messages. */
  pin: boolean;
  unpin: boolean;
  /** Start a thread from the message. */
  thread: boolean;
  /** Block the author: not yourself, a bot, or someone you already blocked (desktop's user menu offers it on the same terms). */
  blockAuthor: boolean;
  /** Forward to another chat: only messages stored on the server (not system, ephemeral or private ones). */
  forward: boolean;
}

const NONE: MessageActions = { reply: false, edit: false, delete: false, react: false, copyText: false, copyLink: false, markUnread: false, pin: false, unpin: false, thread: false, blockAuthor: false, forward: false };

/** The actions to offer on one message, read from core's message menu so mobile and desktop agree. */
export function messageActions(message: ChatMessage, access: ChannelAccess, userId: string, authorBlocked = false): MessageActions {
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
          canCreateThread: access.canCreateThread,
          forwardSupported: true,
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
  return { reply: access.canSend && ids.has('reply'), edit: ids.has('edit'), delete: ids.has('delete'), react: ids.has('addReaction'), copyText: ids.has('copyText'), copyLink: ids.has('copyMessageLink'), markUnread: ids.has('markUnread'), pin: ids.has('pin'), unpin: ids.has('unpin'), thread: ids.has('thread'), blockAuthor: message.author.id !== userId && !message.author.bot && !authorBlocked, forward: access.standard && ids.has('forward') && canForward(message, 'standard') };
}
