// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleContextMenuKey } from '@renderer/interface/app/shortcuts';

const key = (init: KeyboardEventInit) => new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });

afterEach(() => {
  document.body.innerHTML = '';
});

describe('handleContextMenuKey', () => {
  it('dispatches contextmenu at the focused element for Shift+F10 and the Menu key', () => {
    const button = document.createElement('button');
    document.body.appendChild(button);
    button.focus();
    const seen = vi.fn();
    button.addEventListener('contextmenu', (e) => seen(e.bubbles, e.cancelable));
    const e = key({ key: 'F10', shiftKey: true });
    expect(handleContextMenuKey(e)).toBe(true);
    expect(e.defaultPrevented).toBe(true);
    expect(handleContextMenuKey(key({ key: 'ContextMenu' }))).toBe(true);
    expect(seen).toHaveBeenCalledTimes(2);
    expect(seen).toHaveBeenCalledWith(true, true);
  });

  it('leaves text fields and unfocused pages alone', () => {
    expect(handleContextMenuKey(key({ key: 'ContextMenu' }))).toBe(false);
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    const e = key({ key: 'F10', shiftKey: true });
    expect(handleContextMenuKey(e)).toBe(false);
    expect(e.defaultPrevented).toBe(false);
  });

  it('ignores other keys', () => {
    const button = document.createElement('button');
    document.body.appendChild(button);
    button.focus();
    expect(handleContextMenuKey(key({ key: 'F10' }))).toBe(false);
    expect(handleContextMenuKey(key({ key: 'a' }))).toBe(false);
  });
});
