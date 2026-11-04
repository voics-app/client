import { describe, expect, it } from 'vitest';
import { contextMenuPoint, isContextMenuKey, rovingTarget, trapTarget, wrapIndex } from '@discordy/core/domain/rovingFocus';
import { fixedShortcutAction } from '@discordy/core/domain/shortcutCatalog';

describe('rovingTarget', () => {
  it('moves with arrows and clamps at the ends', () => {
    expect(rovingTarget('ArrowDown', 1, 4)).toBe(2);
    expect(rovingTarget('ArrowDown', 3, 4)).toBe(3);
    expect(rovingTarget('ArrowUp', 1, 4)).toBe(0);
    expect(rovingTarget('ArrowUp', 0, 4)).toBe(0);
  });
  it('jumps with Home and End', () => {
    expect(rovingTarget('Home', 2, 5)).toBe(0);
    expect(rovingTarget('End', 2, 5)).toBe(4);
  });
  it('ignores other keys and empty lists', () => {
    expect(rovingTarget('a', 1, 4)).toBeNull();
    expect(rovingTarget('ArrowLeft', 1, 4)).toBeNull();
    expect(rovingTarget('ArrowDown', 0, 0)).toBeNull();
  });
  it('supports horizontal lists', () => {
    expect(rovingTarget('ArrowRight', 0, 3, 'horizontal')).toBe(1);
    expect(rovingTarget('ArrowDown', 0, 3, 'horizontal')).toBeNull();
  });
  it('starts from an end when nothing is current', () => {
    expect(rovingTarget('ArrowDown', -1, 3)).toBe(0);
    expect(rovingTarget('ArrowUp', -1, 3)).toBe(2);
  });
});

describe('wrapIndex', () => {
  it('wraps both ways', () => {
    expect(wrapIndex(3, 2, 1)).toBe(0);
    expect(wrapIndex(3, 0, -1)).toBe(2);
    expect(wrapIndex(3, 1, 1)).toBe(2);
  });
  it('handles no current entry and empty lists', () => {
    expect(wrapIndex(3, -1, 1)).toBe(0);
    expect(wrapIndex(3, -1, -1)).toBe(2);
    expect(wrapIndex(0, -1, 1)).toBe(-1);
  });
});

describe('trapTarget', () => {
  const items = ['a', 'b', 'c'];
  it('wraps Tab at the last and Shift+Tab at the first item', () => {
    expect(trapTarget(items, 'c', false)).toBe('a');
    expect(trapTarget(items, 'a', true)).toBe('c');
  });
  it('lets the browser move focus inside the dialog', () => {
    expect(trapTarget(items, 'b', false)).toBeNull();
    expect(trapTarget(items, 'b', true)).toBeNull();
  });
  it('pulls escaped focus back in', () => {
    expect(trapTarget(items, null, false)).toBe('a');
    expect(trapTarget(items, null, true)).toBe('c');
  });
  it('does nothing without focusable items', () => {
    expect(trapTarget([], null, false)).toBeNull();
  });
});

describe('context menu keys', () => {
  it('recognises ContextMenu and Shift+F10 only', () => {
    expect(isContextMenuKey({ key: 'ContextMenu', shiftKey: false, ctrlKey: false, altKey: false })).toBe(true);
    expect(isContextMenuKey({ key: 'F10', shiftKey: true, ctrlKey: false, altKey: false })).toBe(true);
    expect(isContextMenuKey({ key: 'F10', shiftKey: false, ctrlKey: false, altKey: false })).toBe(false);
    expect(isContextMenuKey({ key: 'F10', shiftKey: true, ctrlKey: true, altKey: false })).toBe(false);
  });
  it('anchors inside the element', () => {
    expect(contextMenuPoint({ left: 10, top: 100, width: 200, height: 40 })).toEqual({ x: 50, y: 120 });
    expect(contextMenuPoint({ left: 10, top: 100, width: 20, height: 40 })).toEqual({ x: 20, y: 120 });
  });
});

describe('fixedShortcutAction', () => {
  it('maps the fixed navigation shortcuts', () => {
    expect(fixedShortcutAction('Ctrl+Alt+ArrowUp')).toBe('prevServer');
    expect(fixedShortcutAction('Ctrl+Alt+ArrowDown')).toBe('nextServer');
    expect(fixedShortcutAction('Ctrl+/')).toBe('showShortcuts');
    expect(fixedShortcutAction('Alt+ArrowUp')).toBeNull();
    expect(fixedShortcutAction('Escape')).toBeNull();
  });
});
