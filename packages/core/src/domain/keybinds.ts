/** Keybind model: the action catalog, defaults, merge of stored binds, conflict detection and the global (system-wide) specs. Device-local, never synced. */
import { keyNameCode } from './uiohookKeys';

export type KeybindAction =
  | 'palette'
  | 'toggleMute'
  | 'toggleDeafen'
  | 'pushToMute'
  | 'toggleCamera'
  | 'toggleScreenShare'
  | 'answerCall'
  | 'declineCall'
  | 'markRead'
  | 'search'
  | 'upload'
  | 'prevChannel'
  | 'nextChannel'
  | 'prevUnread'
  | 'nextUnread'
  | 'historyBack'
  | 'historyForward'
  | 'toggleMembers'
  | 'toggleStreamerMode';

export interface Keybind {
  id: string;
  action: KeybindAction;
  /** Described combination such as `Ctrl+Shift+M`; empty when unbound. */
  keys: string;
  /** Fire system-wide while the app is unfocused (needs the native key hook; only for actions that allow it). */
  global?: boolean;
}

export interface ActionInfo {
  action: KeybindAction;
  id: string;
  label: string;
  group: 'Voice' | 'Calls' | 'Navigation' | 'General';
  defaultKeys: string;
  /** May be bound system-wide through the native key hook. */
  globalCapable: boolean;
  /** Held actions react to key down and key up (push to mute). */
  hold: boolean;
}

const a = (action: KeybindAction, id: string, label: string, group: ActionInfo['group'], defaultKeys: string, globalCapable = false, hold = false): ActionInfo => ({ action, id, label, group, defaultKeys, globalCapable, hold });

export const ACTION_CATALOG: readonly ActionInfo[] = [
  a('toggleMute', 'mute', 'Toggle mute', 'Voice', 'Ctrl+Shift+M', true),
  a('toggleDeafen', 'deafen', 'Toggle deafen', 'Voice', 'Ctrl+Shift+D', true),
  a('pushToMute', 'pushToMute', 'Push to mute', 'Voice', '', true, true),
  a('toggleCamera', 'toggleCamera', 'Toggle camera', 'Voice', 'Ctrl+Shift+V', true),
  a('toggleScreenShare', 'toggleScreenShare', 'Start or stop screen share', 'Voice', 'Ctrl+Shift+S'),
  a('answerCall', 'answerCall', 'Answer incoming call', 'Calls', 'Ctrl+Shift+A', true),
  a('declineCall', 'declineCall', 'Decline incoming call', 'Calls', 'Ctrl+Shift+X', true),
  a('palette', 'palette', 'Quick switcher', 'Navigation', 'Ctrl+K'),
  a('prevChannel', 'prev', 'Previous channel', 'Navigation', 'Alt+ArrowUp'),
  a('nextChannel', 'next', 'Next channel', 'Navigation', 'Alt+ArrowDown'),
  a('prevUnread', 'prevUnread', 'Previous unread channel', 'Navigation', 'Alt+Shift+ArrowUp'),
  a('nextUnread', 'nextUnread', 'Next unread channel', 'Navigation', 'Alt+Shift+ArrowDown'),
  a('historyBack', 'historyBack', 'Go back in history', 'Navigation', 'Alt+ArrowLeft'),
  a('historyForward', 'historyForward', 'Go forward in history', 'Navigation', 'Alt+ArrowRight'),
  a('markRead', 'read', 'Mark channel as read', 'General', 'Escape'),
  a('search', 'search', 'Search', 'General', 'Ctrl+F'),
  a('upload', 'upload', 'Upload a file', 'General', 'Ctrl+Shift+U'),
  a('toggleMembers', 'toggleMembers', 'Toggle member list', 'General', 'Ctrl+U'),
  a('toggleStreamerMode', 'toggleStreamerMode', 'Toggle streamer mode', 'General', '', true),
];

export const ACTION_LABELS: Record<string, string> = Object.fromEntries(ACTION_CATALOG.map((i) => [i.action, i.label]));

export const infoFor = (action: KeybindAction): ActionInfo => ACTION_CATALOG.find((i) => i.action === action)!;

export const DEFAULT_KEYBINDS: Keybind[] = ACTION_CATALOG.map((i) => ({ id: i.id, action: i.action, keys: i.defaultKeys }));

/**
 * Brings stored binds up to the current catalog: keeps the user's keys and global flag for known actions,
 * adds actions introduced later with their defaults, drops unknown ones. Order follows the catalog.
 */
export function mergeKeybinds(stored: unknown): Keybind[] {
  const byAction = new Map<string, Partial<Keybind>>();
  if (Array.isArray(stored)) for (const k of stored) if (k && typeof k === 'object' && typeof (k as Keybind).action === 'string') byAction.set((k as Keybind).action, k as Keybind);
  return ACTION_CATALOG.map((i) => {
    const s = byAction.get(i.action);
    const keys = typeof s?.keys === 'string' ? s.keys : i.defaultKeys;
    return { id: i.id, action: i.action, keys, ...(s?.global === true && i.globalCapable && keys ? { global: true } : {}) };
  });
}

function withGlobal(k: Keybind): Keybind {
  const { global, ...rest } = k;
  return global && k.keys && infoFor(k.action).globalCapable ? { ...rest, global: true } : rest;
}

export function setKeybindKeys(binds: Keybind[], id: string, keys: string): Keybind[] {
  return binds.map((k) => (k.id === id ? withGlobal({ ...k, keys }) : k));
}

export function setKeybindGlobal(binds: Keybind[], id: string, global: boolean): Keybind[] {
  return binds.map((k) => (k.id === id ? withGlobal({ ...k, global }) : k));
}

export function resetKeybind(binds: Keybind[], id: string): Keybind[] {
  const def = DEFAULT_KEYBINDS.find((k) => k.id === id);
  return def ? binds.map((k) => (k.id === id ? { ...def } : k)) : binds;
}

export function isDefault(bind: Keybind): boolean {
  const def = DEFAULT_KEYBINDS.find((k) => k.id === bind.id);
  return !!def && def.keys === bind.keys && !bind.global;
}

/** Labels of the other binds (and fixed shortcuts) that use the same combination as bind `id`. */
export function conflictsFor(binds: readonly Keybind[], id: string, fixed: readonly { keys: string; label: string }[] = []): string[] {
  const me = binds.find((k) => k.id === id);
  if (!me || !me.keys) return [];
  const labels = binds.filter((k) => k.id !== id && k.keys === me.keys).map((k) => infoFor(k.action).label);
  return [...labels, ...fixed.filter((f) => f.keys === me.keys).map((f) => f.label)];
}

export interface GlobalSpec {
  id: string;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  keycode: number;
  hold: boolean;
}

/** Parses a described combination (`Ctrl+Shift+M`) into modifiers plus a uiohook keycode; null when the key has no native code. */
export function parseCombo(keys: string): Omit<GlobalSpec, 'id' | 'hold'> | null {
  const parts = keys.split('+');
  const key = keys.endsWith('++') ? '+' : parts.pop();
  if (!key) return null;
  const code = keyNameCode(key);
  if (code === null) return null;
  return { ctrl: parts.includes('Ctrl'), alt: parts.includes('Alt'), shift: parts.includes('Shift'), keycode: code };
}

export function globalSpecs(binds: readonly Keybind[]): GlobalSpec[] {
  const out: GlobalSpec[] = [];
  for (const k of binds) {
    const info = infoFor(k.action);
    if (!k.global || !info.globalCapable || !k.keys) continue;
    const parsed = parseCombo(k.keys);
    if (parsed) out.push({ id: k.id, hold: info.hold, ...parsed });
  }
  return out;
}
