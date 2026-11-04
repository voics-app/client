// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_KEYBINDS } from '@discordy/core/domain/keybinds';
import { usePrefsStore } from '@renderer/application/stores/prefsStore';
import { KeybindsEditor } from '@renderer/interface/features/settings/user/KeybindsEditor';

const keysOf = (id: string) => usePrefsStore.getState().keybinds.find((k) => k.id === id)?.keys;

beforeEach(() => usePrefsStore.setState({ keybinds: DEFAULT_KEYBINDS.map((k) => ({ ...k })), pttLabel: null }));
afterEach(cleanup);

describe('KeybindsEditor', () => {
  it('lists every action by group and a push to talk pointer', () => {
    render(<KeybindsEditor />);
    expect(screen.getByRole('button', { name: 'Change shortcut for Next unread channel' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Change shortcut for Answer incoming call' })).toBeTruthy();
    expect(screen.getByText('Push to talk')).toBeTruthy();
    expect(screen.getByText('Not bound')).toBeTruthy();
  });

  it('records a combination and shows conflict warnings', () => {
    render(<KeybindsEditor />);
    fireEvent.click(screen.getByRole('button', { name: 'Change shortcut for Toggle mute' }));
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(keysOf('mute')).toBe('Ctrl+K');
    expect(screen.getAllByRole('alert').map((a) => a.textContent)).toEqual(expect.arrayContaining(['Conflicts with Quick switcher', 'Conflicts with Toggle mute']));
  });

  it('cancels recording on Escape and resets one action', () => {
    render(<KeybindsEditor />);
    fireEvent.click(screen.getByRole('button', { name: 'Change shortcut for Toggle mute' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(keysOf('mute')).toBe('Ctrl+Shift+M');
    expect(screen.queryByRole('button', { name: 'Reset shortcut for Toggle mute' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Change shortcut for Toggle mute' }));
    fireEvent.keyDown(window, { key: 'j', altKey: true });
    fireEvent.click(screen.getByRole('button', { name: 'Reset shortcut for Toggle mute' }));
    expect(keysOf('mute')).toBe('Ctrl+Shift+M');
  });

  it('clears a bind and resets everything', () => {
    render(<KeybindsEditor />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear shortcut for Toggle deafen' }));
    expect(keysOf('deafen')).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'Reset all to defaults' }));
    expect(usePrefsStore.getState().keybinds).toEqual(DEFAULT_KEYBINDS);
  });

  it('hides the Global option without the desktop key hook', () => {
    render(<KeybindsEditor />);
    expect(screen.queryByRole('switch', { name: /Global shortcut/ })).toBeNull();
  });
});
