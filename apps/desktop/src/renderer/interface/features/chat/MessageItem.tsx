import { ArrowBendUpLeft, ArrowClockwise, ChatTeardropText, Copy, DotsThree, Eye, LockKey, PencilSimple, Plugs, PushPin, Smiley, Trash, WarningCircle } from '@phosphor-icons/react';
import { isMentioned } from '@renderer/domain/notificationPolicy';
import { memo, useState } from 'react';
import { useGuildStore } from '@renderer/application/stores/guildStore';
import { reactionKey, useMessageStore, type ChatMessage } from '@renderer/application/stores/messageStore';
import { useSessionStore } from '@renderer/application/stores/sessionStore';
import { useUiStore } from '@renderer/application/stores/uiStore';
import { Permission } from '@shared/contracts/permissions';
import { MessageFlag, type Embed } from '@shared/contracts/rest';
import { attempt, copyText } from '../../app/actions';
import { useConnectionStore } from '../../app/connectionStore';
import { getRuntime } from '../../app/runtime';
import { can, useChannelPermissions } from '../../shared/hooks/usePermissions';
import { displayName, useRoleColor } from '../../shared/hooks/useNames';
import { formatTime } from '../../shared/hooks/useNow';
import { Avatar } from '../../shared/ui/Avatar';
import { IconButton } from '../../shared/ui/IconButton';
import { Menu, useMenu, type MenuEntry } from '../../shared/ui/Menu';
import { Tooltip } from '../../shared/ui/Tooltip';
import { AttachmentView } from './AttachmentView';
import { useEmojiPopover } from './EmojiPopover';
import { UserMenuTarget } from '../members/UserContextMenu';
import { MarkdownView } from './MarkdownView';
import { MessageComponents } from './MessageComponents';
import { MessageEditor } from './MessageEditor';

function EmbedView({ embed }: { embed: Embed }) {
  const color = embed.color ? `#${embed.color.toString(16).padStart(6, '0')}` : 'var(--accent)';
  return (
    <div className="embed" style={{ borderLeftColor: color }}>
      {embed.author && <p className="embed-author">{embed.author.name}</p>}
      {embed.title && <p className="embed-title">{embed.url ? <a href={embed.url} target="_blank" rel="noreferrer">{embed.title}</a> : embed.title}</p>}
      {embed.description && <p className="embed-desc">{embed.description}</p>}
      {embed.fields && (
        <div className="embed-fields">
          {embed.fields.map((f, i) => (
            <div key={i} className={f.inline ? 'is-inline' : ''}>
              <p className="embed-field-name">{f.name}</p>
              <p>{f.value}</p>
            </div>
          ))}
        </div>
      )}
      {embed.image && <img className="embed-image" src={embed.image.url} alt="" loading="lazy" />}
      {embed.footer && <p className="embed-footer">{embed.footer.text}</p>}
    </div>
  );
}

function ReplyPreview({ message, guildId }: { message: ChatMessage; guildId: string | null | undefined }) {
  const ref = message.referenced_message ?? (message.message_reference?.message_id ? useMessageStore.getState().timelines[message.channel_id]?.byId[message.message_reference.message_id] : null);
  if (!message.message_reference) return null;
  return (
    <div className="reply-preview">
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
        <span className="reply-text is-missing">Original message unavailable</span>
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

function Reactions({ message }: { message: ChatMessage }) {
  const cdn = useConnectionStore((s) => s.cdnUrl);
  const canReact = can(useChannelPermissions(message.channel_id), Permission.ADD_REACTIONS);
  if (!message.reactions || message.reactions.length === 0) return null;
  return (
    <div className="reactions">
      {message.reactions.map((r) => {
        const key = reactionKey(r.emoji);
        return (
          <button
            key={key}
            type="button"
            className={`reaction${r.me ? ' is-me' : ''}`}
            disabled={!canReact}
            aria-pressed={r.me}
            aria-label={`${r.emoji.name} ${r.count}`}
            onClick={() => {
              const api = getRuntime().api;
              const store = useMessageStore.getState();
              const me = useSessionStore.getState().user?.id ?? '';
              void me;
              if (r.me) {
                store.reactionRemove(message.channel_id, message.id, r.emoji, true);
                void attempt(() => api.removeReaction(message.channel_id, message.id, key));
              } else {
                store.reactionAdd(message.channel_id, message.id, r.emoji, true);
                void attempt(() => api.addReaction(message.channel_id, message.id, key));
              }
            }}
          >
            {r.emoji.id ? <img src={`${cdn}/emojis/${r.emoji.id}.${r.emoji.animated ? 'gif' : 'png'}`} alt={r.emoji.name ?? ''} /> : <span>{r.emoji.name}</span>}
            <span className="tnum">{r.count}</span>
          </button>
        );
      })}
    </div>
  );
}

export interface MessageItemProps {
  message: ChatMessage;
  startsGroup: boolean;
  guildId: string | null | undefined;
  onRetry: (message: ChatMessage) => void;
  onDiscard: (message: ChatMessage) => void;
}

export const MessageItem = memo(function MessageItem({ message, startsGroup, guildId, onRetry, onDiscard }: MessageItemProps) {
  const me = useSessionStore((s) => s.user?.id);
  const myRoles = useGuildStore((s) => (me && message.guild_id ? s.members[message.guild_id]?.[me]?.roles : undefined));
  const perms = useChannelPermissions(message.channel_id);
  const editing = useUiStore((s) => s.editing?.messageId === message.id);
  const setEditing = useUiStore((s) => s.setEditing);
  const setReplyTo = useUiStore((s) => s.setReplyTo);
  const openDialog = useUiStore((s) => s.openDialog);
  const setSidePanel = useUiStore((s) => s.setSidePanel);
  const color = useRoleColor(guildId, message.author.id);
  const nick = useGuildStore((s) => (guildId ? s.members[guildId]?.[message.author.id]?.nick : null));
  const menu = useMenu();
  const [hover, setHover] = useState(false);
  const channel = useGuildStore((s) => s.channels[message.channel_id]);
  const isMine = message.author.id === me;
  const standard = (message.deliveryMode ?? 'standard') === 'standard';
  const canManage = can(perms, Permission.MANAGE_MESSAGES);
  const name = displayName(message.author, nick);

  const emoji = useEmojiPopover(guildId, (picked) => {
    const api = getRuntime().api;
    useMessageStore.getState().reactionAdd(message.channel_id, message.id, picked.emoji, true);
    void attempt(() => api.addReaction(message.channel_id, message.id, picked.api));
  });

  const remove = () =>
    openDialog({
      kind: 'confirm',
      title: 'Delete message',
      body: 'This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: async () => {
        if (!channel) return;
        await attempt(() => getRuntime().privacy.sender.remove(channel, message.id), 'Could not delete message');
      },
    });

  const entries: MenuEntry[] = [
    { kind: 'item', label: 'Reply', icon: <ArrowBendUpLeft size={16} />, onSelect: () => setReplyTo(message.channel_id, message) },
    ...(isMine && standard ? [{ kind: 'item', label: 'Edit message', icon: <PencilSimple size={16} />, onSelect: () => setEditing({ channelId: message.channel_id, messageId: message.id }) } satisfies MenuEntry] : []),
    ...(standard && can(perms, Permission.MANAGE_MESSAGES) ? [{ kind: 'item', label: message.pinned ? 'Unpin message' : 'Pin message', icon: <PushPin size={16} />, onSelect: () => void attempt(() => (message.pinned ? getRuntime().api.unpin(message.channel_id, message.id) : getRuntime().api.pin(message.channel_id, message.id)), 'Could not update pin') } satisfies MenuEntry] : []),
    ...(standard && channel?.guild_id && can(perms, Permission.CREATE_PUBLIC_THREADS)
      ? [{ kind: 'item', label: 'Create thread', icon: <ChatTeardropText size={16} />, onSelect: () => void attempt(async () => { const t = await getRuntime().api.createThread(message.channel_id, { name: message.content.slice(0, 40) || 'Thread', message_id: message.id }); useGuildStore.getState().upsertChannel(t); setSidePanel({ kind: 'thread', threadId: t.id }); }, 'Could not create thread') } satisfies MenuEntry]
      : []),
    { kind: 'item', label: 'Copy text', icon: <Copy size={16} />, onSelect: () => void copyText(message.content, 'Message copied') },
    { kind: 'item', label: 'Copy message ID', icon: <Copy size={16} />, onSelect: () => void copyText(message.id, 'Message ID copied') },
    ...((isMine || canManage) && (standard || isMine)
      ? [{ kind: 'separator' } satisfies MenuEntry, { kind: 'item', label: 'Delete message', icon: <Trash size={16} />, danger: true, onSelect: remove } satisfies MenuEntry]
      : []),
  ];

  const failed = message.localState === 'failed';
  const sending = message.localState === 'sending';
  const mentionsMe = me ? isMentioned(message, { meId: me, myRoleIds: myRoles ?? [] }) && !!message.guild_id : false;
  const ephemeral = ((message.flags ?? 0) & MessageFlag.EPHEMERAL) !== 0;
  const system = message.type !== 0 && message.type !== 19 && message.type !== 20;

  if (ephemeral && message.interaction_metadata && message.interaction_metadata.user.id !== me) return null;

  if (system) {
    return (
      <div className="message system" data-message-id={message.id}>
        <span className="system-text">
          <strong>{name}</strong> {message.type === 7 ? 'joined the server.' : message.type === 6 ? 'pinned a message to this channel.' : 'did something.'}
        </span>
        <time className="message-time-inline">{formatTime(message.timestamp)}</time>
      </div>
    );
  }

  return (
    <div
      className={`message${startsGroup ? ' starts-group' : ''}${mentionsMe ? ' is-mention' : ''}${sending ? ' is-sending' : ''}${failed ? ' is-failed' : ''}${editing ? ' is-editing' : ''}`}
      data-message-id={message.id}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onContextMenu={menu.openAt}
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
                <button type="button" className="message-author" style={color ? { color } : undefined} onClick={() => openDialog({ kind: 'profile', userId: message.author.id, guildId: guildId ?? null })}>
                  {name}
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
              {message.edited_timestamp && <span className="edited">(edited)</span>}
            </>
          )}
          {message.attachments.length > 0 && <div className="attachments">{message.attachments.map((a) => <AttachmentView key={a.id} attachment={a} channelId={message.channel_id} />)}</div>}
          {message.embeds.map((e, i) => <EmbedView key={i} embed={e} />)}
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
        {hover && !editing && !sending && !failed && (
          <div className="message-toolbar glass" role="toolbar" aria-label="Message actions">
            {standard && (
              <IconButton label="Add reaction" size="sm" onClick={(e) => emoji.open(e.currentTarget, false)}>
                <Smiley size={18} />
              </IconButton>
            )}
            <IconButton label="Reply" size="sm" onClick={() => setReplyTo(message.channel_id, message)}>
              <ArrowBendUpLeft size={18} />
            </IconButton>
            {isMine && standard && (
              <IconButton label="Edit" size="sm" onClick={() => setEditing({ channelId: message.channel_id, messageId: message.id })}>
                <PencilSimple size={18} />
              </IconButton>
            )}
            <IconButton label="More" size="sm" onClick={menu.openBelow}>
              <DotsThree size={18} weight="bold" />
            </IconButton>
          </div>
        )}
      </div>
      <Menu open={menu.open} x={menu.anchor?.x ?? 0} y={menu.anchor?.y ?? 0} entries={entries} onClose={menu.close} minWidth={220} />
      {emoji.node}
    </div>
  );
});
