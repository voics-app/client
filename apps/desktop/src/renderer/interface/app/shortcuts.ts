import { useEffect } from 'react';
import { useGuildStore } from '@renderer/application/stores/guildStore';
import { usePrefsStore, type Keybind } from '@renderer/application/stores/prefsStore';
import { useUiStore } from '@renderer/application/stores/uiStore';
import { contextMenuPoint, isContextMenuKey, wrapIndex } from '@renderer/domain/rovingFocus';
import { fixedShortcutAction, type FixedShortcutAction } from '@renderer/domain/shortcutCatalog';
import { isTextChannel, openChannel, openGuild } from './navigation';
import { toggleDeafen, toggleMute } from './voiceActions';

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

const ACTIONS: Record<Keybind['action'], () => void> = {
  palette: () => useUiStore.getState().openPalette(!useUiStore.getState().paletteOpen),
  toggleMute: () => void toggleMute(),
  toggleDeafen: () => void toggleDeafen(),
  markRead: () => undefined,
  search: () => useUiStore.getState().openPalette(true),
  upload: () => document.querySelector<HTMLButtonElement>('button[aria-label="Attach files"]')?.click(),
  prevChannel: () => adjacentChannel(-1),
  nextChannel: () => adjacentChannel(1),
};

const FIXED: Record<FixedShortcutAction, () => void> = {
  prevServer: () => adjacentServer(-1),
  nextServer: () => adjacentServer(1),
  showShortcuts: toggleShortcutsDialog,
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

/** Registers the user-configurable in-app shortcuts plus the fixed navigation ones. Global (out-of-focus) push-to-talk lives in the main process. */
export function useGlobalShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (handleContextMenuKey(e)) return;
      const described = describeEvent(e);
      const fixed = fixedShortcutAction(described);
      if (fixed) {
        e.preventDefault();
        FIXED[fixed]();
        return;
      }
      const bind = usePrefsStore.getState().keybinds.find((k) => k.keys === described && k.action !== 'markRead');
      if (!bind) return;
      e.preventDefault();
      ACTIONS[bind.action]();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
