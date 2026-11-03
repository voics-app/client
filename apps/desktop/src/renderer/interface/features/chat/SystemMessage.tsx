import { ChatTeardropText, DotsThree, EnvelopeSimple, HandWaving, Hash, Image as ImageIcon, PencilSimple, Phone, PhoneX, PushPin, SignIn, SignOut, Smiley, Trash, Warning } from '@phosphor-icons/react';
import { useState, type FocusEvent, type ReactNode } from 'react';
import { useGuildStore } from '@renderer/application/stores/guildStore';
import { usePrefsStore } from '@renderer/application/stores/prefsStore';
import { useMessageStore, type ChatMessage } from '@renderer/application/stores/messageStore';
import { useUiStore } from '@renderer/application/stores/uiStore';
import { useVoiceStore } from '@renderer/application/stores/voiceStore';
import type { MenuItemModel } from '@renderer/domain/menuModel';
import { parseApiEmoji, quickApiForm, quickReactions } from '@renderer/domain/quickReactions';
import { buildSystemMenu, buildSystemToolbar, systemSpec, type SystemIcon, type SystemLinkAction, type SystemPart } from '@renderer/domain/systemMessage';
import { Permission } from '@shared/contracts/permissions';
import { attempt, copyText, jumpToMessage, markMessageUnread } from '../../app/actions';
import { joinVoiceChannel } from '../../app/voiceActions';
import { getRuntime } from '../../app/runtime';
import { can, useChannelPermissions } from '../../shared/hooks/usePermissions';
import { displayName } from '../../shared/hooks/useNames';
import { formatTime } from '../../shared/hooks/useNow';
import { fullMessageTime } from '@renderer/domain/messageTime';
import { Button } from '../../shared/ui/Button';
import { IconButton } from '../../shared/ui/IconButton';
import { Menu, useMenu } from '../../shared/ui/Menu';
import { toMenuEntries } from '../../shared/ui/menuAdapter';
import { Tooltip } from '../../shared/ui/Tooltip';

const ICONS: Record<SystemIcon, ReactNode> = {
  arrowIn: <SignIn size={18} weight="bold" />,
  arrowOut: <SignOut size={18} weight="bold" />,
  phone: <Phone size={18} weight="fill" />,
  phoneEnded: <PhoneX size={18} weight="fill" />,
  pencil: <PencilSimple size={18} weight="bold" />,
  image: <ImageIcon size={18} weight="bold" />,
  pin: <PushPin size={18} weight="fill" />,
  wave: <HandWaving size={18} weight="fill" />,
  thread: <ChatTeardropText size={18} weight="fill" />,
  warning: <Warning size={18} weight="fill" />,
};

const MENU_ICONS: Record<string, ReactNode> = {
  markUnread: <EnvelopeSimple size={16} />,
  delete: <Trash size={16} />,
  copyId: <Hash size={16} />,
};

/** One system row: coloured icon, text with links, optional Join call / Wave button, hover toolbar and context menu. */
export function SystemMessage({ message, name, reactions }: { message: ChatMessage; name: string; reactions?: ReactNode }) {
  const perms = useChannelPermissions(message.channel_id);
  const channel = useGuildStore((s) => s.channels[message.channel_id]);
  const recent = usePrefsStore((s) => s.recentReactions);
  // Developer mode arrives with the Advanced settings tab; until the pref exists, Copy ID stays visible.
  const developerMode = usePrefsStore((s) => (s as { developerMode?: boolean }).developerMode);
  const inCallHere = useVoiceStore((s) => s.call.channelId === message.channel_id && s.call.status !== 'idle');
  const setSidePanel = useUiStore((s) => s.setSidePanel);
  const openDialog = useUiStore((s) => s.openDialog);
  const menu = useMenu();
  const [hover, setHover] = useState(false);
  const [focused, setFocused] = useState(false);
  const [waved, setWaved] = useState(false);

  const canManage = can(perms, Permission.MANAGE_MESSAGES);
  const canReact = can(perms, Permission.ADD_REACTIONS);
  const target = message.mentions?.[0];
  const threadId = message.thread?.id ?? message.message_reference?.channel_id;
  const spec = systemSpec({
    type: message.type,
    messageId: message.id,
    authorName: name,
    targetName: target ? displayName(target) : null,
    content: message.content ?? '',
    timestamp: message.timestamp,
    call: message.call,
    threadName: message.thread?.name ?? null,
    hasReference: Boolean(message.message_reference?.message_id),
  });

  const follow = (action: SystemLinkAction) => {
    if (action === 'pins') return setSidePanel({ kind: 'pins' });
    if (action === 'thread') return threadId ? setSidePanel({ kind: 'thread', threadId }) : undefined;
    const ref = message.message_reference;
    if (ref?.message_id) jumpToMessage(ref.channel_id ?? message.channel_id, ref.message_id);
  };

  const wave = () => {
    if (!channel || waved) return;
    setWaved(true);
    void attempt(() => getRuntime().privacy.sender.send(channel, { content: '\u{1F44B}', replyTo: message.id }), 'Could not send wave').then((ok) => {
      if (ok === undefined) setWaved(false);
    });
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

  const quick = quickReactions(recent)[0];
  const react = (api: string) => {
    const emoji = parseApiEmoji(api);
    useMessageStore.getState().reactionAdd(message.channel_id, message.id, { id: emoji.id, name: emoji.name, animated: emoji.animated }, true);
    void attempt(() => getRuntime().api.addReaction(message.channel_id, message.id, api));
  };

  const run = (it: MenuItemModel) => {
    switch (it.id) {
      case 'markUnread': return markMessageUnread(message.channel_id, message.id);
      case 'delete': return confirmRemove();
      case 'copyId': return void copyText(message.id, 'Message ID copied');
    }
  };
  const entries = toMenuEntries(buildSystemMenu({ canManageMessages: canManage, developerMode }), run, MENU_ICONS);
  const toolbarActions = buildSystemToolbar({ canReact, canManageMessages: canManage, reaction: quick ? quickApiForm(quick) : '\u{1F44D}' });
  const visible = hover || focused || menu.open;

  const renderPart = (p: SystemPart, i: number) => {
    if (p.t === 'name') return <strong key={i}>{p.text}</strong>;
    if (p.t === 'link') return <button key={i} type="button" className="system-link" onClick={() => follow(p.action)}>{p.text}</button>;
    return <span key={i}>{p.text}</span>;
  };

  return (
    <div
      className={`message system is-${spec.kind} tone-${spec.tone}${visible ? ' is-toolbar-open' : ''}`}
      data-message-id={message.id}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e: FocusEvent<HTMLElement>) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
      }}
      onContextMenu={(e) => menu.openAt(e)}
    >
      <span className="system-icon" aria-hidden="true">{ICONS[spec.icon]}</span>
      <div className="system-body">
        <span className="system-text">{spec.parts.map(renderPart)}</span>
        <Tooltip label={fullMessageTime(message.timestamp)}>
          <time className="message-time-inline" dateTime={message.timestamp} tabIndex={0}>{formatTime(message.timestamp)}</time>
        </Tooltip>
        {spec.joinCall && (
          <Button size="sm" variant="primary" icon={<Phone size={14} weight="fill" />} disabled={inCallHere || !channel} onClick={() => void joinVoiceChannel(null, message.channel_id)}>
            {inCallHere ? 'In call' : 'Join call'}
          </Button>
        )}
        {spec.wave && (
          <Button size="sm" variant="secondary" icon={<HandWaving size={14} weight="fill" />} disabled={waved || !channel} onClick={wave}>
            {waved ? 'Waved' : 'Wave to say hi'}
          </Button>
        )}
        {reactions}
      </div>
      {visible && (
        <div className="message-toolbar glass" role="toolbar" aria-label="Message actions">
          {toolbarActions.map((a) => {
            if (a.id === 'react') return <IconButton key={a.id} label={a.label} size="sm" onClick={() => a.arg && react(a.arg)}><Smiley size={18} /></IconButton>;
            if (a.id === 'delete') return <IconButton key={a.id} label={a.label} size="sm" onClick={confirmRemove}><Trash size={18} /></IconButton>;
            return <IconButton key={a.id} label={a.label} size="sm" onClick={(e) => menu.openBelow(e)}><DotsThree size={18} weight="bold" /></IconButton>;
          })}
        </div>
      )}
      <Menu open={menu.open} x={menu.anchor?.x ?? 0} y={menu.anchor?.y ?? 0} entries={entries} onClose={menu.close} minWidth={200} />
    </div>
  );
}
