import { ArrowClockwise, BellSlash, ChatTeardropText, Eye, LockKey, Plugs, WarningCircle } from '@phosphor-icons/react';
import { isMentioned, isSilent } from '@renderer/domain/notificationPolicy';
import { memo, useRef, useState } from 'react';
import { useGuildStore } from '@renderer/application/stores/guildStore';
import { reactionKey, useMessageStore, type ChatMessage } from '@renderer/application/stores/messageStore';
import { useSessionStore } from '@renderer/application/stores/sessionStore';
import { useUiStore } from '@renderer/application/stores/uiStore';
import { Permission } from '@shared/contracts/permissions';
import { systemMessageText } from '@renderer/domain/dmModel';
import { MessageFlag, type Reaction } from '@shared/contracts/rest';
import { buildReactionMenu } from '@renderer/domain/messageMenuModel';
import { reactionSummary } from '@renderer/domain/emojiModel';
import { isForward } from '@renderer/domain/forward';
import { attempt, jumpToMessage } from '../../app/actions';
import { useConnectionStore } from '../../app/connectionStore';
import { getRuntime } from '../../app/runtime';
import { can, useChannelPermissions } from '../../shared/hooks/usePermissions';
import { displayName, useRoleColor } from '../../shared/hooks/useNames';
import { RoleDot, useRoleColorDisplay } from '../../shared/ui/RoleDot';
import { formatTime } from '../../shared/hooks/useNow';
import { Avatar } from '../../shared/ui/Avatar';
import { Menu, useMenu } from '../../shared/ui/Menu';
import { toMenuEntries } from '../../shared/ui/menuAdapter';
import { Tooltip } from '../../shared/ui/Tooltip';
import { MessageAttachments, UploadProgress } from './AttachmentView';
import { MessageEmbeds } from './EmbedView';
import { ForwardedMessage } from './ForwardedMessage';
import { useMessageInteractions } from './useMessageInteractions';
import { UserMenuTarget } from '../members/UserContextMenu';
import { MarkdownView } from './MarkdownView';
import { MessageComponents } from './MessageComponents';
import { MessageEditor } from './MessageEditor';

function ReplyPreview({ message, guildId }: { message: ChatMessage; guildId: string | null | undefined }) {
  const ref = message.referenced_message ?? (message.message_reference?.message_id ? useMessageStore.getState().timelines[message.channel_id]?.byId[message.message_reference.message_id] : null);
  if (!message.message_reference || isForward(message)) return null;
  return (
    <div
      className={`reply-preview${message.message_reference?.message_id ? ' is-link' : ''}`}
      onClick={() => message.message_reference?.message_id && jumpToMessage(message.channel_id, message.message_reference.message_id)}
    >
      <span className="reply-hook" aria-hidden="true" />
      {ref ? (
        <>
          <UserMenuTarget userId={ref.author.id} name={displayName(ref.author)} guildId={guildId} user={ref.author}>
            <Avatar id={ref.author.id} name={displayName(ref.author)} avatar={ref.author.avatar} size={16} />
            <span className="reply-name">{displayName(ref.author)}</span>
          </UserMenuTarget>
          <span className="reply-text">{ref.content || 'Click to see attachment'}</span>
        </>
      ) : (
        <span className="reply-text is-missing">{message.referenced_message === null ? 'Original message was deleted' : 'Original message unavailable'}</span>
      )}
    </div>
  );
}

function InteractionHeader({ message }: { message: ChatMessage }) {
  const meta = message.interaction_metadata;
  if (!meta) return null;
  return (
    <div className="interaction-header">
      <span className="reply-hook" aria-hidden="true" />
      <Avatar id={meta.user.id} name={displayName(meta.user)} avatar={meta.user.avatar} size={16} />
      <span className="reply-name">{displayName(meta.user)}</span>
      <span className="reply-text">used {meta.name ? <strong>/{meta.name}</strong> : 'a command'}</span>
    </div>
  );
}

const LONG_PRESS_MS = 500;

function ReactionChip({ message, reaction, canReact, canManage }: { message: ChatMessage; reaction: Reaction; canReact: boolean; canManage: boolean }) {
  const cdn = useConnectionStore((s) => s.cdnUrl);
  const menu = useMenu();
  const [names, setNames] = useState<{ names: string[]; count: number } | null>(null);
  const press = useRef<{ timer: ReturnType<typeof setTimeout> | null; fired: boolean }>({ timer: null, fired: false });
  const key = reactionKey(reaction.emoji);
  const label = reaction.emoji.id ? `:${reaction.emoji.name}:` : (reaction.emoji.name ?? '');

  const toggle = () => {
    const api = getRuntime().api;
    const store = useMessageStore.getState();
    if (reaction.me) {
      store.reactionRemove(message.channel_id, message.id, reaction.emoji, true);
      void attempt(() => api.removeReaction(message.channel_id, message.id, key));
    } else {
      store.reactionAdd(message.channel_id, message.id, reaction.emoji, true);
      void attempt(() => api.addReaction(message.channel_id, message.id, key));
    }
  };
  const openList = () => useUiStore.getState().openDialog({ kind: 'reactionUsers', channelId: message.channel_id, messageId: message.id, emoji: key });
  const loadNames = () => {
    if (names && names.count === reaction.count) return;
    void getRuntime()
      .api.reactionUsers(message.channel_id, message.id, key)
      .then((users) => setNames({ count: reaction.count, names: users.slice(0, 4).map((u) => displayName({ username: u.username ?? '', global_name: u.global_name ?? null })) }))
      .catch(() => undefined);
  };
  const run = (id: string) => {
    const api = getRuntime().api;
    switch (id) {
      case 'whoReacted': return openList();
      case 'toggle': return toggle();
      case 'removeEmoji':
        return useUiStore.getState().openDialog({
          kind: 'confirm',
          title: 'Remove reactions',
          body: `Remove every ${label} reaction from this message?`,
          confirmLabel: 'Remove',
          danger: true,
          onConfirm: async () => void (await attempt(() => api.removeEmojiReactions(message.channel_id, message.id, key), 'Could not remove reactions')),
        });
      case 'removeAll':
        return useUiStore.getState().openDialog({
          kind: 'confirm',
          title: 'Remove all reactions',
          body: 'Remove every reaction from this message?',
          confirmLabel: 'Remove all',
          danger: true,
          onConfirm: async () => void (await attempt(() => api.removeAllReactions(message.channel_id, message.id), 'Could not remove reactions')),
        });
    }
  };
  const entries = toMenuEntries(buildReactionMenu({ canReact, mine: reaction.me, canManageMessages: canManage }), (it) => run(it.id), {});

  return (
    <>
      <Tooltip label={names ? reactionSummary(names.names, names.count, label) : `Reacted with ${label}`}>
        <button
          type="button"
          className={`reaction${reaction.me ? ' is-me' : ''}`}
          disabled={!canReact && !reaction.me}
          aria-pressed={reaction.me}
          aria-label={`${reaction.emoji.name} ${reaction.count}`}
          onMouseEnter={loadNames}
          onFocus={loadNames}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            menu.openAt(e);
          }}
          onPointerDown={() => {
            press.current.fired = false;
            press.current.timer = setTimeout(() => {
              press.current.fired = true;
              openList();
            }, LONG_PRESS_MS);
          }}
          onPointerUp={() => press.current.timer && clearTimeout(press.current.timer)}
          onPointerLeave={() => press.current.timer && clearTimeout(press.current.timer)}
          onClick={() => {
            if (press.current.fired) {
              press.current.fired = false;
              return;
            }
            toggle();
          }}
        >
          {reaction.emoji.id ? <img src={`${cdn}/emojis/${reaction.emoji.id}.${reaction.emoji.animated ? 'gif' : 'png'}`} alt={reaction.emoji.name ?? ''} /> : <span>{reaction.emoji.name}</span>}
          <span className="tnum">{reaction.count}</span>
        </button>
      </Tooltip>
      <Menu open={menu.open} x={menu.anchor?.x ?? 0} y={menu.anchor?.y ?? 0} entries={entries} onClose={menu.close} minWidth={200} />
    </>
  );
}

function Reactions({ message }: { message: ChatMessage }) {
  const perms = useChannelPermissions(message.channel_id);
  const canReact = can(perms, Permission.ADD_REACTIONS);
  const canManage = can(perms, Permission.MANAGE_MESSAGES);
  if (!message.reactions || message.reactions.length === 0) return null;
  return (
    <div className="reactions">
      {message.reactions.map((r) => (
        <ReactionChip key={reactionKey(r.emoji)} message={message} reaction={r} canReact={canReact} canManage={canManage} />
      ))}
    </div>
  );
}

export interface MessageItemProps {
  message: ChatMessage;
  startsGroup: boolean;
  guildId: string | null | undefined;
  onRetry: (message: ChatMessage) => void;
  onDiscard: (message: ChatMessage) => void;
  /** Briefly highlighted after a jump to this message. */
  flash?: boolean;
}

export const MessageItem = memo(function MessageItem({ message, startsGroup, guildId, onRetry, onDiscard, flash }: MessageItemProps) {
  const me = useSessionStore((s) => s.user?.id);
  const myRoles = useGuildStore((s) => (me && message.guild_id ? s.members[message.guild_id]?.[me]?.roles : undefined));
  const editing = useUiStore((s) => s.editing?.messageId === message.id);
  const openDialog = useUiStore((s) => s.openDialog);
  const setSidePanel = useUiStore((s) => s.setSidePanel);
  const roleColor = useRoleColorDisplay(useRoleColor(guildId, message.author.id));
  const nick = useGuildStore((s) => (guildId ? s.members[guildId]?.[message.author.id]?.nick : null));
  const name = displayName(message.author, nick);

  const failed = message.localState === 'failed';
  const sending = message.localState === 'sending';
  const interactions = useMessageInteractions(message, guildId, { me, editing, blocked: sending || failed });
  const mentionsMe = me ? isMentioned(message, { meId: me, myRoleIds: myRoles ?? [] }) && !!message.guild_id : false;
  const ephemeral = ((message.flags ?? 0) & MessageFlag.EPHEMERAL) !== 0;
  const system = message.type !== 0 && message.type !== 19 && message.type !== 20;

  const target = message.mentions?.[0];
  const groupText = system ? systemMessageText(message.type, name, target ? displayName(target) : null, message.content ?? '') : null;

  if (ephemeral && message.interaction_metadata && message.interaction_metadata.user.id !== me) return null;

  if (system) {
    return (
      <div className="message system" data-message-id={message.id}>
        <span className="system-text">
          {groupText ?? <><strong>{name}</strong> {message.type === 7 ? 'joined the server.' : message.type === 6 ? 'pinned a message to this channel.' : 'did something.'}</>}
        </span>
        <time className="message-time-inline">{formatTime(message.timestamp)}</time>
      </div>
    );
  }

  return (
    <div
      className={`message${startsGroup ? ' starts-group' : ''}${mentionsMe ? ' is-mention' : ''}${sending ? ' is-sending' : ''}${failed ? ' is-failed' : ''}${editing ? ' is-editing' : ''}${interactions.visible ? ' is-toolbar-open' : ''}${flash ? ' is-flash' : ''}`}
      data-message-id={message.id}
      {...interactions.rootProps}
    >
      {startsGroup && <ReplyPreview message={message} guildId={guildId} />}
      {startsGroup && <InteractionHeader message={message} />}
      <div className="message-row">
        <div className="message-gutter">
          {startsGroup ? (
            <UserMenuTarget userId={message.author.id} name={name} guildId={guildId} user={message.author}>
              <button type="button" className="message-avatar" onClick={() => openDialog({ kind: 'profile', userId: message.author.id, guildId: guildId ?? null })} aria-label={`Profile of ${name}`}>
                <Avatar id={message.author.id} name={name} avatar={message.author.avatar} size={40} bot={message.author.bot} />
              </button>
            </UserMenuTarget>
          ) : (
            <time className="message-time-gutter tnum" dateTime={message.timestamp}>{formatTime(message.timestamp)}</time>
          )}
        </div>
        <div className="message-main">
          {startsGroup && (
            <header className="message-head">
              <UserMenuTarget userId={message.author.id} name={name} guildId={guildId} user={message.author}>
                <button type="button" className="message-author" style={roleColor.tint ? { color: roleColor.tint } : undefined} onClick={() => openDialog({ kind: 'profile', userId: message.author.id, guildId: guildId ?? null })}>
                  <RoleDot color={roleColor.dot} />{name}
                </button>
              </UserMenuTarget>
              {message.deliveryMode === 'ephemeral' && (
                <Tooltip label="Delivered end-to-end encrypted. Stored only on your devices."><span className="message-mode mode-ephemeral" tabIndex={0}><LockKey size={12} weight="fill" /></span></Tooltip>
              )}
              {message.deliveryMode === 'p2p' && (
                <Tooltip label="Delivered directly peer-to-peer. Stored only on your devices."><span className="message-mode mode-p2p" tabIndex={0}><Plugs size={12} weight="fill" /></span></Tooltip>
              )}
              <time className="message-time tnum" dateTime={message.timestamp}>{new Date(message.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</time>
            </header>
          )}
          {editing ? (
            <MessageEditor message={message} />
          ) : (
            <>
              {message.content && <MarkdownView source={message.content} guildId={guildId} />}
              {isSilent(message) && (
                <Tooltip label="Sent silently: no notification">
                  <span className="silent-mark" tabIndex={0} role="img" aria-label="Silent message"><BellSlash size={12} /></span>
                </Tooltip>
              )}
              {message.edited_timestamp && (
                <Tooltip label={`Edited ${new Date(message.edited_timestamp).toLocaleString([], { dateStyle: 'full', timeStyle: 'short' })}`}>
                  <span className="edited" tabIndex={0}>(edited)</span>
                </Tooltip>
              )}
            </>
          )}
          <ForwardedMessage message={message} guildId={guildId} />
          {message.attachments.length > 0 && <MessageAttachments attachments={message.attachments} channelId={message.channel_id} />}
          {sending && message.nonce != null && <UploadProgress nonce={String(message.nonce)} />}
          <MessageEmbeds message={message} />
          <MessageComponents message={message} />
          <Reactions message={message} />
          {ephemeral && (
            <p className="message-ephemeral">
              <Eye size={13} /> Only you can see this
              <button type="button" onClick={() => useMessageStore.getState().remove(message.channel_id, message.id)}>Dismiss message</button>
            </p>
          )}
          {message.thread && (
            <button type="button" className="thread-chip" onClick={() => setSidePanel({ kind: 'thread', threadId: message.thread!.id })}>
              <ChatTeardropText size={16} /> {message.thread.name} <span>{message.thread.message_count ?? 0} messages</span>
            </button>
          )}
          {failed && (
            <p className="message-failed" role="alert">
              <WarningCircle size={14} weight="fill" /> {message.error ?? 'Not delivered'}
              <button type="button" onClick={() => onRetry(message)}><ArrowClockwise size={13} /> Retry</button>
              <button type="button" onClick={() => onDiscard(message)}>Discard</button>
            </p>
          )}
        </div>
        {interactions.toolbar}
      </div>
      {interactions.overlays}
    </div>
  );
});
