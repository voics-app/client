// @vitest-environment jsdom
import { cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePrefsStore } from '@discordy/core/application/stores/prefsStore';
import { useUiStore } from '@discordy/core/application/stores/uiStore';

const { markChannelRead, markGuildRead } = vi.hoisted(() => ({ markChannelRead: vi.fn(), markGuildRead: vi.fn() }));
vi.mock('@renderer/interface/app/actions', () => ({ markChannelRead, markGuildRead }));
vi.mock('@renderer/interface/app/voiceActions', () => ({ pushToMute: vi.fn(), toggleCamera: vi.fn(), toggleDeafen: vi.fn(), toggleMute: vi.fn(), toggleScreenShare: vi.fn() }));
vi.mock('@renderer/interface/app/callActions', () => ({ answerRingingCall: vi.fn(), declineRingingCall: vi.fn() }));
vi.mock('@renderer/interface/app/globalKeybinds', () => ({ isGloballyHandled: () => false, startGlobalKeybinds: () => () => undefined }));
vi.mock('@renderer/interface/app/appearance', () => ({ handleZoomKey: () => false }));
import { useGlobalShortcuts } from '@renderer/interface/app/shortcuts';

beforeEach(() => {
  markChannelRead.mockClear();
  markGuildRead.mockClear();
  useUiStore.setState({ view: { kind: 'guild', guildId: 'g', channelId: 'c' }, dialog: null, paletteOpen: false });
  usePrefsStore.setState({ keybinds: [{ id: 'read', action: 'markRead', keys: 'Escape' }] });
});
afterEach(cleanup);

describe('mark-read keyboard behavior', () => {
  it('marks the channel with Escape and the server with Shift+Escape', () => {
    renderHook(useGlobalShortcuts);
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.keyDown(window, { key: 'Escape', shiftKey: true });
    expect(markChannelRead).toHaveBeenCalledWith('c');
    expect(markGuildRead).toHaveBeenCalledWith('g');
  });

  it('keeps the server variant when the shortcut is rebound with modifiers', () => {
    usePrefsStore.setState({ keybinds: [{ id: 'read', action: 'markRead', keys: 'Ctrl+R' }] });
    renderHook(useGlobalShortcuts);
    fireEvent.keyDown(window, { key: 'r', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'r', ctrlKey: true, shiftKey: true });
    expect(markChannelRead).toHaveBeenCalledWith('c');
    expect(markGuildRead).toHaveBeenCalledWith('g');
  });

  it('lets an unconsumed Escape mark read while the composer has focus', () => {
    renderHook(useGlobalShortcuts);
    render(<textarea className="composer-input" aria-label="Message" />);
    const composer = screen.getByRole('textbox');
    composer.focus();
    fireEvent.keyDown(composer, { key: 'Escape' });
    expect(markChannelRead).toHaveBeenCalledWith('c');
  });

  it('runs a rebound modifier shortcut from the composer without consuming ordinary typing', () => {
    usePrefsStore.setState({ keybinds: [{ id: 'read', action: 'markRead', keys: 'Ctrl+R' }] });
    renderHook(useGlobalShortcuts);
    render(<textarea className="composer-input" aria-label="Message" />);
    const composer = screen.getByRole('textbox');
    fireEvent.keyDown(composer, { key: 'r', ctrlKey: true });
    fireEvent.keyDown(composer, { key: 'r', ctrlKey: true, shiftKey: true });
    expect(markChannelRead).toHaveBeenCalledOnce();
    expect(markGuildRead).toHaveBeenCalledOnce();
    usePrefsStore.setState({ keybinds: [{ id: 'read', action: 'markRead', keys: 'R' }] });
    expect(fireEvent.keyDown(composer, { key: 'r' })).toBe(true);
    expect(markChannelRead).toHaveBeenCalledOnce();
  });

  it('leaves consumed Escape, settings fields and overlays alone', () => {
    renderHook(useGlobalShortcuts);
    render(<><textarea className="composer-input" aria-label="Message" onKeyDown={(event) => event.preventDefault()} /><input aria-label="Setting" /></>);
    fireEvent.keyDown(screen.getByLabelText('Message'), { key: 'Escape' });
    fireEvent.keyDown(screen.getByLabelText('Setting'), { key: 'Escape' });
    useUiStore.setState({ dialog: { kind: 'inbox' } });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(markChannelRead).not.toHaveBeenCalled();
    expect(markGuildRead).not.toHaveBeenCalled();
  });
});
