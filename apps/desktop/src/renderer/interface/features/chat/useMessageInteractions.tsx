import { ArrowBendUpLeft, ArrowBendUpRight, ChatTeardropText, Copy, DotsThree, Hash, Link, MagnifyingGlass, PencilSimple, PushPin, SmileyWink, Smiley, SpeakerHigh, Trash, EnvelopeSimple, ArrowSquareOut, FloppyDisk, Image as ImageIcon, PlusCircle } from '@phosphor-icons/react';
import { useCallback, useMemo, useRef, useState, type FocusEvent, type MouseEvent, type ReactNode } from 'react';
import { useGuildStore } from '@renderer/application/stores/guildStore';
import { usePrefsStore } from '@renderer/application/stores/prefsStore';
import { useMessageStore, type ChatMessage } from '@renderer/application/stores/messageStore';
import { useUiStore } from '@renderer/application/stores/uiStore';
import { channelLink } from '@renderer/domain/channelMenuModel';
import type { MenuItemModel } from '@renderer/domain/menuModel';
import { buildMessageMenu, buildToolbar, type MessageTarget } from '@renderer/domain/messageMenuModel';
import { parseApiEmoji, quickReactions, type QuickEmoji } from '@renderer/domain/quickReactions';
import { Permission } from '@shared/contracts/permissions';
import { attempt, copyText, markMessageUnread } from '../../app/actions';
import { useConnectionStore } from '../../app/connectionStore';
import { openExternalUrl } from '../../app/links';
import { addEmojiToGuild, copyImage, saveImage, searchGoogle, speakText, speechSupported } from '../../app/messageActions';
import { getRuntime } from '../../app/runtime';
import { can, useChannelPermissions, useGuildPermissions } from '../../shared/hooks/usePermissions';
import { useShiftHeld } from '../../shared/hooks/useShiftHeld';
import { IconButton } from '../../shared/ui/IconButton';
import { Menu, useMenu } from '../../shared/ui/Menu';
import { toMenuEntries } from '../../shared/ui/menuAdapter';
import { selectionWithin, targetFromElement } from './contextTarget';
import { useEmojiPopover } from './EmojiPopover';

/** Forwarding has no server support yet (messages#13), so its entries stay hidden. */
export const FORWARD_SUPPORTED = false;

const ICONS: Record<string, ReactNode> = {
  addReaction: <Smiley size={16} />,
  reactMore: <SmileyWink size={16} />,
  edit: <PencilSimple size={16} />,
  pin: <PushPin size={16} />,
  unpin: <PushPin size={16} />,
  reply: <ArrowBendUpLeft size={16} />,
  forward: <ArrowBendUpRight size={16} />,
  thread: <ChatTeardropText size={16} />,
  copyText: <Copy size={16} />,
  copySelection: <Copy size={16} />,
  searchGoogle: <MagnifyingGlass size={16} />,
  markUnread: <EnvelopeSimple size={16} />,
  copyMessageLink: <Link size={16} />,
  copyLink: <Link size={16} />,
  openLink: <ArrowSquareOut size={16} />,
  copyImage: <ImageIcon size={16} />,
  saveImage: <FloppyDisk size={16} />,
  addEmoji: <PlusCircle size={16} />,
  speak: <SpeakerHigh size={16} />,
  delete: <Trash size={16} />,
  copyId: <Hash size={16} />,
};

function EmojiGlyph({ emoji }: { emoji: QuickEmoji }) {
  const cdn = useConnectionStore((s) => s.cdnUrl);
  return emoji.id ? <img className="custom-emoji" src={`${cdn}/emojis/${emoji.id}.${emoji.animated ? 'gif' : 'png'}`} alt={emoji.name} draggable={false} /> : <span className="emoji-quick" aria-hidden="true">{emoji.name}</span>;
}

/** Marks the channel unread from this message by moving the read marker to the message before it. */
export function markUnreadFrom(channelId: string, messageId: string): void {
  markMessageUnread(channelId, messageId);
}

export interface MessageInteractions {
  rootProps: {
    onMouseEnter: (e: MouseEvent) => void;
    onMouseLeave: () => void;
    onFocus: () => void;
    onBlur: (e: FocusEvent<HTMLElement>) => void;
    onContextMenu: (e: MouseEvent<HTMLElement>) => void;
  };
  toolbar: ReactNode;
  overlays: ReactNode;
  visible: boolean;
}

/** Hover/focus toolbar and per-target right-click menu of one message. */
export function useMessageInteractions(message: ChatMessage, guildId: string | null | undefined, opts: { me: string | undefined; editing: boolean; blocked: boolean }): MessageInteractions {
  const perms = useChannelPermissions(message.channel_id);
  const guildPerms = useGuildPermissions(guildId);
  const channel = useGuildStore((s) => s.channels[message.channel_id]);
  const guild = useGuildStore((s) => (guildId ? s.guilds[guildId] : undefined));
  const recent = usePrefsStore((s) => s.recentReactions);
  const setReplyTo = useUiStore((s) => s.setReplyTo);
  const setEditing = useUiStore((s) => s.setEditing);
  const openDialog = useUiStore((s) => s.openDialog);
  const setSidePanel = useUiStore((s) => s.setSidePanel);
  const menu = useMenu();
  const [hover, setHover] = useState(false);
  const [focused, setFocused] = useState(false);
  const [target, setTarget] = useState<MessageTarget>({ kind: 'message' });
  const selectionRef = useRef('');
  const anchorRef = useRef<HTMLElement | null>(null);

  const isMine = message.author.id === opts.me;
  const standard = (message.deliveryMode ?? 'standard') === 'standard';
  const quick = useMemo(() => quickReactions(recent), [recent]);

  const react = useCallback(
    (api: string) => {
      const emoji = parseApiEmoji(api);
      const store = useMessageStore.getState();
      const runtime = getRuntime().api;
      const mine = message.reactions?.some((r) => (r.emoji.id ? `${r.emoji.name}:${r.emoji.id}` : r.emoji.name) === api && r.me);
      const apiEmoji = { id: emoji.id, name: emoji.name, animated: emoji.animated };
      if (mine) {
        store.reactionRemove(message.channel_id, message.id, apiEmoji, true);
        void attempt(() => runtime.removeReaction(message.channel_id, message.id, api));
      } else {
        store.reactionAdd(message.channel_id, message.id, apiEmoji, true);
        usePrefsStore.getState().recordReaction(emoji);
        void attempt(() => runtime.addReaction(message.channel_id, message.id, api));
      }
    },
    [message.channel_id, message.id, message.reactions],
  );

  const emoji = useEmojiPopover(guildId, (picked) => {
    useMessageStore.getState().reactionAdd(message.channel_id, message.id, picked.emoji, true);
    usePrefsStore.getState().recordReaction({ id: picked.emoji.id, name: picked.emoji.name ?? picked.api, animated: picked.emoji.animated });
    void attempt(() => getRuntime().api.addReaction(message.channel_id, message.id, picked.api));
  }, message.channel_id);

  const visible = !opts.editing && !opts.blocked && (hover || focused || menu.open || emoji.isOpen);
  const [shift, setShift] = useShiftHeld(visible);

  const removeNow = () => {
    if (!channel) return;
    void attempt(() => getRuntime().privacy.sender.remove(channel, message.id), 'Could not delete message');
  };
  const confirmRemove = () =>
    openDialog({
      kind: 'confirm',
      title: 'Delete message',
      body: 'This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: async () => {
        if (channel) await attempt(() => getRuntime().privacy.sender.remove(channel, message.id), 'Could not delete message');
      },
    });

  const canManage = can(perms, Permission.MANAGE_MESSAGES);
  const canReact = can(perms, Permission.ADD_REACTIONS);

  const run = (id: string, arg: string | undefined) => {
    switch (id) {
      case 'react': return arg && react(arg);
      case 'reactMore': return anchorRef.current ? emoji.open(anchorRef.current, false) : emoji.openAt(menu.anchor?.x ?? 0, menu.anchor?.y ?? 0, false);
      case 'reply': return setReplyTo(message.channel_id, message);
      case 'edit': return setEditing({ channelId: message.channel_id, messageId: message.id });
      case 'pin':
      case 'unpin':
        return void attempt(() => (id === 'unpin' ? getRuntime().api.unpin(message.channel_id, message.id) : getRuntime().api.pin(message.channel_id, message.id)), 'Could not update pin');
      case 'thread':
        return void attempt(async () => {
          const t = await getRuntime().api.createThread(message.channel_id, { name: message.content.slice(0, 40) || 'Thread', message_id: message.id });
          useGuildStore.getState().upsertChannel(t);
          setSidePanel({ kind: 'thread', threadId: t.id });
        }, 'Could not create thread');
      case 'copyText': return void copyText(message.content, 'Message copied');
      case 'copyId': return void copyText(message.id, 'Message ID copied');
      case 'copySelection': return void copyText(selectionRef.current, 'Copied');
      case 'searchGoogle': return arg && searchGoogle(arg);
      case 'markUnread': return markUnreadFrom(message.channel_id, message.id);
      case 'copyMessageLink': return void copyText(channelLink(guildId, message.channel_id, message.id), 'Message link copied');
      case 'speak': return speakText(message.content);
      case 'delete': return confirmRemove();
      case 'openLink': return arg && openExternalUrl(arg);
      case 'copyLink': return arg && void copyText(arg, 'Link copied');
      case 'copyImage': return arg && void copyImage(arg);
      case 'saveImage': return arg && void saveImage(arg, target.kind === 'image' ? target.filename : 'image');
      case 'addEmoji': return target.kind === 'emoji' && guildId && void addEmojiToGuild(guildId, target.name, target.url);
    }
  };

  const model = buildMessageMenu(
    {
      isMine,
      standard,
      canReact,
      canManageMessages: canManage,
      canCreateThread: Boolean(channel?.guild_id) && can(perms, Permission.CREATE_PUBLIC_THREADS),
      forwardSupported: FORWARD_SUPPORTED,
      canSpeak: speechSupported(),
      hasText: message.content.trim().length > 0,
      pinned: Boolean(message.pinned),
      selection: selectionRef.current,
      canAddEmoji:
        Boolean(guildId) &&
        target.kind === 'emoji' &&
        (can(guildPerms, Permission.CREATE_GUILD_EXPRESSIONS) || can(guildPerms, Permission.MANAGE_GUILD_EXPRESSIONS)) &&
        !(guild?.emojis ?? []).some((e) => e.id === target.id),
      quick,
    },
    target,
  );
  const entries = toMenuEntries(model, (it: MenuItemModel) => run(it.id, it.arg), ICONS);
  // Unicode quick reactions are their own label; custom ones also need their image.
  for (const e of entries) {
    if (e.kind === 'submenu' && e.label === 'Add Reaction') e.entries.forEach((sub, i) => { if (sub.kind === 'item' && i < quick.length && quick[i]!.id) sub.icon = <EmojiGlyph emoji={quick[i]!} />; });
  }

  const toolbarActions = buildToolbar({ isMine, standard, canReact, canManageMessages: canManage, forwardSupported: FORWARD_SUPPORTED, pinned: Boolean(message.pinned), quick, shift });
  const toolbar = visible ? (
    <div className="message-toolbar glass" role="toolbar" aria-label="Message actions" data-shift={shift || undefined}>
      {toolbarActions.map((a, i) => {
        const key = `${a.id}-${i}`;
        switch (a.id) {
          case 'react': {
            const e = parseApiEmoji(a.arg);
            return (
              <IconButton key={key} label={a.label} size="sm" onClick={() => react(a.arg)}>
                <EmojiGlyph emoji={e} />
              </IconButton>
            );
          }
          case 'more':
            return (
              <IconButton key={key} label={a.label} size="sm" onClick={(e) => { anchorRef.current = null; setTarget({ kind: 'message' }); selectionRef.current = ''; menu.openBelow(e); }}>
                <DotsThree size={18} weight="bold" />
              </IconButton>
            );
          case 'delete':
            return (
              <IconButton key={key} label={a.label} size="sm" onClick={(e) => (e.shiftKey ? removeNow() : confirmRemove())}>
                <Trash size={18} />
              </IconButton>
            );
          default:
            return (
              <IconButton key={key} label={a.label} size="sm" onClick={(e) => { anchorRef.current = e.currentTarget; run(a.id, undefined); }}>
                {ICONS[a.id === 'reactMore' ? 'addReaction' : a.id]}
              </IconButton>
            );
        }
      })}
    </div>
  ) : null;

  return {
    rootProps: {
      onMouseEnter: (e) => {
        setHover(true);
        setShift(e.shiftKey);
      },
      onMouseLeave: () => setHover(false),
      onFocus: () => setFocused(true),
      onBlur: (e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
      },
      onContextMenu: (e) => {
        anchorRef.current = null;
        selectionRef.current = selectionWithin(e.currentTarget);
        setTarget(targetFromElement(e.target as Element));
        menu.openAt(e);
      },
    },
    toolbar,
    overlays: (
      <>
        <Menu open={menu.open} x={menu.anchor?.x ?? 0} y={menu.anchor?.y ?? 0} entries={entries} onClose={menu.close} minWidth={220} />
        {emoji.node}
      </>
    ),
    visible,
  };
}
