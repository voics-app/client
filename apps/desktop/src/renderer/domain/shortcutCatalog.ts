/** Fixed (non-rebindable) in-app shortcuts, shown in the keyboard-shortcuts dialog and handled by useGlobalShortcuts. */
export type FixedShortcutAction = 'prevServer' | 'nextServer' | 'showShortcuts' | 'inbox';

export const FIXED_SHORTCUTS: readonly { keys: string; action: FixedShortcutAction | null; label: string }[] = [
  { keys: 'Ctrl+Alt+ArrowUp', action: 'prevServer', label: 'Previous server' },
  { keys: 'Ctrl+Alt+ArrowDown', action: 'nextServer', label: 'Next server' },
  { keys: 'Ctrl+/', action: 'showShortcuts', label: 'Show keyboard shortcuts' },
  { keys: 'Ctrl+I', action: 'inbox', label: 'Open the Mentions inbox' },
  { keys: 'ArrowUp / ArrowDown', action: null, label: 'Move through the focused list (servers, channels, messages, members)' },
  { keys: 'Home / End', action: null, label: 'Jump to the first or last item of the focused list' },
  { keys: 'Shift+F10', action: null, label: 'Open the context menu of the focused item (also the Menu key)' },
  { keys: 'Escape', action: null, label: 'Close the open dialog or menu and return to where you were' },
];

export const ACTION_LABELS: Record<string, string> = {
  palette: 'Quick switcher',
  toggleMute: 'Toggle mute',
  toggleDeafen: 'Toggle deafen',
  markRead: 'Mark channel as read',
  search: 'Search',
  upload: 'Upload a file',
  prevChannel: 'Previous channel',
  nextChannel: 'Next channel',
};

/** Looks up the fixed action for a described key combination (see describeEvent). */
export function fixedShortcutAction(described: string): FixedShortcutAction | null {
  return FIXED_SHORTCUTS.find((s) => s.action && s.keys === described)?.action ?? null;
}
