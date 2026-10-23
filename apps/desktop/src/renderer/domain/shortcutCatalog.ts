/** Fixed (non-rebindable) in-app shortcuts, shown in the keyboard-shortcuts dialog and handled by useGlobalShortcuts. */
export type FixedShortcutAction = 'prevServer' | 'nextServer' | 'showShortcuts' | 'inbox';

export const FIXED_SHORTCUTS: readonly { keys: string; action: FixedShortcutAction | null; label: string }[] = [
  { keys: 'Ctrl+Alt+ArrowUp', action: 'prevServer', label: 'Previous server' },
  { keys: 'Ctrl+Alt+ArrowDown', action: 'nextServer', label: 'Next server' },
  { keys: 'Ctrl+/', action: 'showShortcuts', label: 'Show keyboard shortcuts' },
  { keys: 'Ctrl+I', action: 'inbox', label: 'Open the Mentions inbox' },
  { keys: 'Ctrl+Plus / Ctrl+Minus / Ctrl+0', action: null, label: 'Zoom the interface in, out, or back to 100%' },
  { keys: 'ArrowUp / ArrowDown', action: null, label: 'Move through the focused list (servers, channels, messages, members)' },
  { keys: 'Home / End', action: null, label: 'Jump to the first or last item of the focused list' },
  { keys: 'Shift+F10', action: null, label: 'Open the context menu of the focused item (also the Menu key)' },
  { keys: 'Escape', action: null, label: 'Close the open dialog or menu and return to where you were' },
];

export { ACTION_LABELS } from './keybinds';

/** Looks up the fixed action for a described key combination (see describeEvent). */
export function fixedShortcutAction(described: string): FixedShortcutAction | null {
  return FIXED_SHORTCUTS.find((s) => s.action && s.keys === described)?.action ?? null;
}
