import { describe, expect, it } from 'vitest';
import { ACTION_CATALOG, DEFAULT_KEYBINDS, conflictsFor, globalSpecs, isDefault, mergeKeybinds, parseCombo, resetKeybind, setKeybindGlobal, setKeybindKeys } from '@discordy/core/domain/keybinds';
import { FIXED_SHORTCUTS } from '@discordy/core/domain/shortcutCatalog';

describe('default keybinds', () => {
  it('cover every catalog action with unique ids', () => {
    expect(DEFAULT_KEYBINDS).toHaveLength(ACTION_CATALOG.length);
    expect(new Set(DEFAULT_KEYBINDS.map((k) => k.id)).size).toBe(ACTION_CATALOG.length);
  });
  it('include the new actions', () => {
    const actions = DEFAULT_KEYBINDS.map((k) => k.action);
    for (const a of ['nextUnread', 'answerCall', 'declineCall', 'toggleCamera', 'toggleScreenShare', 'pushToMute', 'historyBack', 'historyForward', 'toggleMembers'] as const) expect(actions).toContain(a);
  });
  it('have no conflicts among themselves or with the fixed shortcuts', () => {
    const fixed = FIXED_SHORTCUTS.filter((f) => f.action).map((f) => ({ keys: f.keys, label: f.label }));
    for (const k of DEFAULT_KEYBINDS) expect(conflictsFor(DEFAULT_KEYBINDS, k.id, fixed)).toEqual([]);
  });
  it('only allow global scope for actions that can run without the window', () => {
    const globalOk = ACTION_CATALOG.filter((i) => i.globalCapable).map((i) => i.action);
    expect(globalOk).toEqual(expect.arrayContaining(['toggleMute', 'toggleDeafen', 'pushToMute']));
    expect(globalOk).not.toContain('palette');
  });
});

describe('mergeKeybinds', () => {
  it('keeps user keys, adds new actions and drops unknown ones', () => {
    const merged = mergeKeybinds([{ id: 'mute', action: 'toggleMute', keys: 'Ctrl+M', global: true }, { id: 'old', action: 'gone', keys: 'X' }]);
    expect(merged).toHaveLength(ACTION_CATALOG.length);
    expect(merged.find((k) => k.action === 'toggleMute')).toEqual({ id: 'mute', action: 'toggleMute', keys: 'Ctrl+M', global: true });
    expect(merged.some((k) => (k.action as string) === 'gone')).toBe(false);
    expect(merged.find((k) => k.action === 'toggleMembers')?.keys).toBe('Ctrl+U');
  });
  it('falls back to defaults for junk and strips global from local-only actions', () => {
    expect(mergeKeybinds(undefined)).toEqual(DEFAULT_KEYBINDS);
    expect(mergeKeybinds([{ id: 'palette', action: 'palette', keys: 'Ctrl+P', global: true }]).find((k) => k.action === 'palette')).toEqual({ id: 'palette', action: 'palette', keys: 'Ctrl+P' });
  });
});

describe('editing', () => {
  it('detects conflicts with other binds and fixed shortcuts', () => {
    const binds = setKeybindKeys(DEFAULT_KEYBINDS, 'mute', 'Ctrl+K');
    expect(conflictsFor(binds, 'mute')).toEqual(['Quick switcher']);
    expect(conflictsFor(binds, 'palette')).toEqual(['Toggle mute']);
    expect(conflictsFor(setKeybindKeys(DEFAULT_KEYBINDS, 'mute', 'Ctrl+I'), 'mute', FIXED_SHORTCUTS)).toEqual(['Open the Mentions inbox']);
  });
  it('ignores unbound keys in conflict detection', () => {
    const binds = setKeybindKeys(setKeybindKeys(DEFAULT_KEYBINDS, 'mute', ''), 'deafen', '');
    expect(conflictsFor(binds, 'mute')).toEqual([]);
  });
  it('resets one action or compares with the default', () => {
    const changed = setKeybindGlobal(setKeybindKeys(DEFAULT_KEYBINDS, 'mute', 'Ctrl+M'), 'mute', true);
    expect(isDefault(changed.find((k) => k.id === 'mute')!)).toBe(false);
    expect(resetKeybind(changed, 'mute')).toEqual(DEFAULT_KEYBINDS);
  });
  it('clears global when the key is cleared and refuses it for local-only actions', () => {
    const g = setKeybindGlobal(DEFAULT_KEYBINDS, 'mute', true);
    expect(g.find((k) => k.id === 'mute')?.global).toBe(true);
    expect(setKeybindKeys(g, 'mute', '').find((k) => k.id === 'mute')?.global).toBeUndefined();
    expect(setKeybindGlobal(DEFAULT_KEYBINDS, 'palette', true).find((k) => k.id === 'palette')?.global).toBeUndefined();
  });
});

describe('global specs', () => {
  it('parses modifiers and the native keycode', () => {
    expect(parseCombo('Ctrl+Shift+M')).toEqual({ ctrl: true, alt: false, shift: true, keycode: 50 });
    expect(parseCombo('Alt+ArrowUp')).toEqual({ ctrl: false, alt: true, shift: false, keycode: 57416 });
    expect(parseCombo('F5')?.keycode).toBe(63);
    expect(parseCombo('Ctrl+MediaPlayPause')).toBeNull();
  });
  it('lists only global, bound, capable binds and flags held actions', () => {
    let binds = setKeybindGlobal(DEFAULT_KEYBINDS, 'mute', true);
    binds = setKeybindGlobal(setKeybindKeys(binds, 'pushToMute', 'Ctrl+Space'), 'pushToMute', true);
    expect(globalSpecs(binds)).toEqual([
      { id: 'mute', hold: false, ctrl: true, alt: false, shift: true, keycode: 50 },
      { id: 'pushToMute', hold: true, ctrl: true, alt: false, shift: false, keycode: 57 },
    ]);
    expect(globalSpecs(DEFAULT_KEYBINDS)).toEqual([]);
  });
});
