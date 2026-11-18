import { appsSubmenu, type ContextCommand } from './contextCommands';
import { item, sep, tidy, type MenuModel } from './menuModel';
import { FORWARD_MENU_HINT } from './forward';
import { quickApiForm, type QuickEmoji } from './quickReactions';

export type MessageTarget =
  | { kind: 'message' }
  | { kind: 'link'; url: string }
  | { kind: 'image'; url: string; openUrl: string; filename: string }
  | { kind: 'emoji'; id: string; name: string; url: string; animated: boolean };

export interface MessageMenuContext {
  isMine: boolean;
  /** Standard delivery (server stored). Ephemeral and P2P messages cannot be reacted to, pinned or threaded. */
  standard: boolean;
  canReact: boolean;
  canManageMessages: boolean;
  /** Guild channel and CREATE_PUBLIC_THREADS. */
  canCreateThread: boolean;
  /** Whether forwarding is supported. Hidden otherwise. */
  forwardSupported: boolean;
  canSpeak: boolean;
  hasText: boolean;
  /** Author-owned, already sent standard message with editable attachments. */
  hasEditableAttachments?: boolean;
  pinned: boolean;
  /** Text selected inside the message at the time of the right-click. */
  selection: string;
  /** Emoji can be added to the current server (permission and not already present). */
  canAddEmoji: boolean;
  quick: QuickEmoji[];
  /** Developer mode (Settings, Advanced): shows Copy Message ID. */
  developerMode?: boolean;
  /** Installed applications' USER and MESSAGE commands; MESSAGE ones fill the Apps submenu. */
  appCommands?: ContextCommand[];
}

function targetBlock(ctx: MessageMenuContext, target: MessageTarget): MenuModel[] {
  const out: MenuModel[] = [];
  if (ctx.selection.trim()) {
    out.push(item('copySelection', 'Copy'));
    out.push(item('searchGoogle', 'Search with Google', { arg: ctx.selection.trim() }));
  }
  switch (target.kind) {
    case 'link':
      out.push(item('openLink', 'Open Link', { arg: target.url }), item('copyLink', 'Copy Link', { arg: target.url }));
      break;
    case 'image':
      out.push(
        item('copyImage', 'Copy Image', { arg: target.url }),
        item('saveImage', 'Save Image', { arg: target.url }),
        item('openLink', 'Open Original', { arg: target.openUrl }),
        item('copyLink', 'Copy Link', { arg: target.openUrl }),
      );
      break;
    case 'emoji':
      out.push(item('copyLink', 'Copy Emoji Link', { arg: target.url }));
      if (ctx.canAddEmoji) out.push(item('addEmoji', 'Add to Server', { arg: target.id }));
      break;
    case 'message':
      break;
  }
  return out;
}

/** Entries every message menu carries, in Discord's order. Entries without permission or support are omitted. */
function messageBlock(ctx: MessageMenuContext): MenuModel[] {
  const out: MenuModel[] = [];
  if (ctx.standard && ctx.canReact) {
    out.push({
      kind: 'submenu',
      id: 'addReaction',
      label: 'Add Reaction',
      items: [...ctx.quick.map((e) => item('react', e.name, { arg: quickApiForm(e) })), item('reactMore', 'More reactions')],
    });
  }
  if (ctx.isMine && ctx.standard) out.push(item('edit', 'Edit Message'));
  if (ctx.isMine && ctx.standard && ctx.hasEditableAttachments) out.push(item('editAttachments', 'Edit Attachments'));
  if (ctx.standard && ctx.canManageMessages) out.push(item(ctx.pinned ? 'unpin' : 'pin', ctx.pinned ? 'Unpin Message' : 'Pin Message'));
  out.push(item('reply', 'Reply'));
  if (ctx.forwardSupported) out.push(ctx.standard ? item('forward', 'Forward') : item('forward', 'Forward', { disabled: true, hint: FORWARD_MENU_HINT }));
  if (ctx.standard && ctx.canCreateThread) out.push(item('thread', 'Create Thread'));
  if (ctx.hasText) out.push(item('copyText', 'Copy Text'));
  out.push(item('markUnread', 'Mark Unread'));
  out.push(item('copyMessageLink', 'Copy Message Link'));
  if (ctx.standard && !ctx.forwardSupported) out.push(item('forwardSoon', 'Forward (coming soon)', { disabled: true }));
  if (!ctx.isMine) out.push(item('report', 'Report Message', { danger: true }));
  if (ctx.canSpeak && ctx.hasText) out.push(item('speak', 'Speak Message'));
  const apps = ctx.standard ? appsSubmenu(ctx.appCommands, 'message') : null;
  if (apps) out.push(sep(), apps);
  if ((ctx.isMine || ctx.canManageMessages) && (ctx.standard || ctx.isMine)) out.push(sep(), item('delete', 'Delete Message', { danger: true }));
  if (ctx.developerMode) out.push(sep(), item('copyId', 'Copy Message ID'));
  return out;
}

/** Context menu for a right-click on a message or on something inside it. Target entries come first, then a separator, then the message entries. */
export function buildMessageMenu(ctx: MessageMenuContext, target: MessageTarget): MenuModel[] {
  const head = targetBlock(ctx, target);
  return tidy([...head, ...(head.length > 0 ? [sep()] : []), ...messageBlock(ctx)]);
}

export type ToolbarAction =
  | { id: 'react'; arg: string; label: string }
  | { id: 'reactMore' | 'reply' | 'edit' | 'forward' | 'copyId' | 'delete' | 'pin' | 'unpin' | 'more'; label: string };

export interface ToolbarContext extends Pick<MessageMenuContext, 'isMine' | 'standard' | 'canReact' | 'canManageMessages' | 'forwardSupported' | 'pinned' | 'quick' | 'developerMode'> {
  shift: boolean;
}

/** Buttons of the hover toolbar. Holding Shift swaps Edit/Reply/Forward for Copy ID, Pin and an unconfirmed Delete. */
export function buildToolbar(ctx: ToolbarContext): ToolbarAction[] {
  const out: ToolbarAction[] = [];
  if (ctx.standard && ctx.canReact) {
    for (const e of ctx.quick) out.push({ id: 'react', arg: quickApiForm(e), label: `React with ${e.name}` });
    out.push({ id: 'reactMore', label: 'Add reaction' });
  }
  if (ctx.shift) {
    if (ctx.developerMode) out.push({ id: 'copyId', label: 'Copy message ID' });
    if (ctx.standard && ctx.canManageMessages) out.push(ctx.pinned ? { id: 'unpin', label: 'Unpin' } : { id: 'pin', label: 'Pin' });
    if (ctx.isMine || ctx.canManageMessages) out.push({ id: 'delete', label: 'Delete (no confirmation)' });
  } else {
    if (ctx.isMine && ctx.standard) out.push({ id: 'edit', label: 'Edit' });
    out.push({ id: 'reply', label: 'Reply' });
    if (ctx.forwardSupported && ctx.standard) out.push({ id: 'forward', label: 'Forward' });
  }
  out.push({ id: 'more', label: 'More' });
  return out;
}

export interface ReactionMenuContext {
  canReact: boolean;
  mine: boolean;
  canManageMessages: boolean;
}

/** Context menu of a reaction chip: who reacted for everyone, removal of one emoji or of all reactions for moderators. */
export function buildReactionMenu(ctx: ReactionMenuContext): MenuModel[] {
  const out: MenuModel[] = [item('whoReacted', 'See who reacted')];
  if (ctx.canReact) out.push(item('toggle', ctx.mine ? 'Remove my reaction' : 'React'));
  if (ctx.canManageMessages) out.push(sep(), item('removeEmoji', 'Remove this emoji', { danger: true }), item('removeAll', 'Remove all reactions', { danger: true }));
  return tidy(out);
}
