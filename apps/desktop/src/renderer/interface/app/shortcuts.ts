import { useEffect } from 'react';
import { useGuildStore } from '@renderer/application/stores/guildStore';
import { usePrefsStore } from '@renderer/application/stores/prefsStore';
import { infoFor, type KeybindAction } from '@renderer/domain/keybinds';
import { useReadStateStore } from '@renderer/application/stores/peopleStores';
import { useNotificationSettingsStore } from '@renderer/application/stores/notificationSettingsStore';
import { isChannelMutedDeep, scopeKey } from '@renderer/domain/notificationSettings';
import { isUnread } from '@renderer/domain/unread';
import { pickUnreadChannel } from '@renderer/domain/unreadNav';
import { useUiStore } from '@renderer/application/stores/uiStore';
import { contextMenuPoint, isContextMenuKey, wrapIndex } from '@renderer/domain/rovingFocus';
import { fixedShortcutAction, type FixedShortcutAction } from '@renderer/domain/shortcutCatalog';
import { isTextChannel, openChannel, openGuild } from './navigation';
import { markChannelRead, markGuildRead } from './actions';
import { handleZoomKey } from './appearance';
import { pushToMute, toggleCamera, toggleDeafen, toggleMute, toggleScreenShare } from './voiceActions';
import { answerRingingCall, declineRingingCall } from './callActions';
import { goHistory, startNavHistory } from './navHistory';
import { isGloballyHandled, startGlobalKeybinds } from './globalKeybinds';

export function describeEvent(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  const key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
  if (!['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) parts.push(key === ' ' ? 'Space' : key);
  return parts.join('+');
}

function adjacentChannel(delta: 1 | -1): void {
  const view = useUiStore.getState().view;
  if (view.kind !== 'guild') return;
  const list = Object.values(useGuildStore.getState().channels)
    .filter((c) => c.guild_id === view.guildId && isTextChannel(c))
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const next = list[wrapIndex(list.length, list.findIndex((c) => c.id === view.channelId), delta)];
  if (next) openChannel(next.id);
}

/** Next or previous unread, unmuted text channel of the open server (or of the DM list at home), wrapping around. */
function adjacentUnread(delta: 1 | -1): void {
  const view = useUiStore.getState().view;
  const guildId = view.kind === 'guild' ? view.guildId : null;
  const reads = useReadStateStore.getState().byChannel;
  const settings = useNotificationSettingsStore.getState().byScope;
  const list = Object.values(useGuildStore.getState().channels)
    .filter((c) => (c.guild_id ?? null) === guildId && isTextChannel(c))
    .sort(guildId ? (a, b) => (a.position ?? 0) - (b.position ?? 0) : (a, b) => (b.last_message_id ?? '').localeCompare(a.last_message_id ?? ''))
    .map((c) => ({ id: c.id, unread: !isChannelMutedDeep(settings[scopeKey(c.guild_id)], c, Date.now()) && isUnread(c.last_message_id, reads[c.id]?.lastReadId) }));
  const next = pickUnreadChannel(list, view.channelId, delta);
  if (next) openChannel(next);
}

/** Ctrl+Alt+Up/Down: previous/next server in rail order. From Home, forward enters the first server and back the last. */
function adjacentServer(delta: 1 | -1): void {
  const { view } = useUiStore.getState();
  const order = useGuildStore.getState().order;
  const current = view.kind === 'guild' ? order.indexOf(view.guildId) : -1;
  const next = order[wrapIndex(order.length, current, delta)];
  if (next) openGuild(next);
}

function toggleShortcutsDialog(): void {
  const ui = useUiStore.getState();
  ui.openDialog(ui.dialog?.kind === 'shortcuts' ? null : { kind: 'shortcuts' });
}

/** Esc marks the open channel read; Shift+Esc marks the whole open server. */
function markCurrentRead(shift = false): void {
  const { view } = useUiStore.getState();
  if (shift && view.kind === 'guild') markGuildRead(view.guildId);
  else if (view.channelId) markChannelRead(view.channelId);
}

/** Ctrl+F: focus the channel header search box; without an open channel it falls back to the quick switcher. */
function focusSearch(): void {
  const ui = useUiStore.getState();
  if (ui.view.channelId) ui.focusSearch();
  else ui.openPalette(true);
}

interface RunContext {
  /** False for the release of a held key (push to mute). */
  pressed: boolean;
  /** The Shift variant of the combination fired (Shift+Esc marks the whole server read). */
  shift: boolean;
}

const ACTIONS: Record<KeybindAction, (ctx: RunContext) => void> = {
  palette: () => useUiStore.getState().openPalette(!useUiStore.getState().paletteOpen),
  toggleMute: () => void toggleMute(),
  toggleDeafen: () => void toggleDeafen(),
  pushToMute: ({ pressed }) => void pushToMute(pressed),
  toggleCamera: () => void toggleCamera(),
  toggleScreenShare: () => toggleScreenShare(),
  answerCall: () => answerRingingCall(),
  declineCall: () => declineRingingCall(),
  markRead: ({ shift }) => markCurrentRead(shift),
  search: focusSearch,
  upload: () => document.querySelector<HTMLButtonElement>('button[aria-label="Attach files"]')?.click(),
  prevChannel: () => adjacentChannel(-1),
  nextChannel: () => adjacentChannel(1),
  prevUnread: () => adjacentUnread(-1),
  nextUnread: () => adjacentUnread(1),
  historyBack: () => goHistory(-1),
  historyForward: () => goHistory(1),
  toggleMembers: () => useUiStore.getState().toggleSidePanel('members'),
};

/** Runs a keybind action; held actions get both the press and the release, every other action only the press. */
export function runKeybindAction(action: KeybindAction, pressed = true, shift = false): void {
  if (!pressed && !infoFor(action).hold) return;
  ACTIONS[action]({ pressed, shift });
}
const FIXED: Record<FixedShortcutAction, () => void> = {
  prevServer: () => adjacentServer(-1),
  nextServer: () => adjacentServer(1),
  showShortcuts: toggleShortcutsDialog,
  inbox: () => {
    const ui = useUiStore.getState();
    ui.openDialog(ui.dialog?.kind === 'inbox' ? null : { kind: 'inbox' });
  },
};

/**
 * Opens the context menu of the focused element from the keyboard (Shift+F10 / Menu key) by dispatching
 * a `contextmenu` event at the element, so every existing onContextMenu handler works unchanged.
 * Text fields keep the native menu. Returns true when the key was handled.
 */
export function handleContextMenuKey(e: KeyboardEvent, doc: Document = document): boolean {
  if (!isContextMenuKey(e)) return false;
  const target = doc.activeElement;
  if (!(target instanceof HTMLElement) || target === doc.body) return false;
  if (target.matches('input, textarea, select, [contenteditable="true"]')) return false;
  const { x, y } = contextMenuPoint(target.getBoundingClientRect());
  e.preventDefault();
  target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 2 }));
  return true;
}

/** Esc belongs to whatever overlay is open (dialog, palette, menu, popover) before it marks anything read. */
function overlayOpen(): boolean {
  const ui = useUiStore.getState();
  return ui.dialog !== null || ui.paletteOpen || document.querySelector('[role="dialog"], [role="menu"], [role="listbox"]') !== null;
}

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.matches('input, textarea, select, [contenteditable="true"]');
}

/** Registers the user-configurable in-app shortcuts plus the fixed navigation ones, the nav history and the global (system-wide) binds. */
export function useGlobalShortcuts(): void {
  useEffect(() => {
    const stopHistory = startNavHistory();
    const stopGlobal = startGlobalKeybinds((action, pressed) => runKeybindAction(action, pressed));
    const heldBinds = new Map<string, string>();
    const onKey = (e: KeyboardEvent) => {
      if (handleContextMenuKey(e) || handleZoomKey(e)) return;
      const described = describeEvent(e);
      const fixed = fixedShortcutAction(described);
      if (fixed) {
        e.preventDefault();
        FIXED[fixed]();
        return;
      }
      const bind = usePrefsStore.getState().keybinds.find((k) => k.keys && (k.keys === described || (k.action === 'markRead' && e.shiftKey && described === `Shift+${k.keys}`)));
      if (!bind || isGloballyHandled(bind.id)) return;
      if (bind.action === 'markRead' && (e.defaultPrevented || isTypingTarget(e.target) || overlayOpen())) return;
      e.preventDefault();
      if (infoFor(bind.action).hold) {
        if (e.repeat) return;
        heldBinds.set(bind.id, e.key);
        runKeybindAction(bind.action, true);
        return;
      }
      runKeybindAction(bind.action, true, bind.keys !== described);
    };
    const release = (id?: string) => {
      for (const bindId of [...heldBinds.keys()]) {
        if (id && id !== bindId) continue;
        heldBinds.delete(bindId);
        const bind = usePrefsStore.getState().keybinds.find((k) => k.id === bindId);
        if (bind) runKeybindAction(bind.action, false);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      for (const [bindId, key] of [...heldBinds]) {
        const keys = usePrefsStore.getState().keybinds.find((k) => k.id === bindId)?.keys ?? '';
        const modifier = e.key === 'Control' || e.key === 'Meta' ? 'Ctrl' : ['Alt', 'Shift'].includes(e.key) ? e.key : null;
        if (key.toLowerCase() === e.key.toLowerCase() || (modifier !== null && keys.split('+').includes(modifier))) release(bindId);
      }
    };
    const onBlur = () => release();
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      stopHistory();
      stopGlobal();
    };
  }, []);
}
