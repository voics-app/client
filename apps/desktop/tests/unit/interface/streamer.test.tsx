// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PREFS, usePrefsStore } from '@discordy/core/application/stores/prefsStore';
import { mergeKeybinds } from '@discordy/core/domain/keybinds';
import { NotificationsTab } from '@renderer/interface/features/settings/user/UserTabs';
import { VerifyEmailBanner } from '@renderer/interface/features/settings/user/AccountSecurity';
import { runKeybindAction } from '@renderer/interface/app/shortcuts';
import { startObsDetection, streamerActive, useStreamerRuntime } from '@renderer/interface/app/streamer';

const obsRunning = vi.hoisted(() => vi.fn<() => Promise<boolean | null>>());
vi.mock('@renderer/interface/app/bridge', () => ({ bridge: { app: { obsRunning } } }));
vi.mock('@renderer/interface/app/runtime', () => ({ getRuntime: () => ({ api: {} }) }));

beforeEach(() => { usePrefsStore.setState(DEFAULT_PREFS); useStreamerRuntime.getState().setDetected(null); obsRunning.mockReset(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('streamer mode', () => {
  it('uses the settings switch and adds a bind to existing saved settings', () => {
    render(<NotificationsTab />);
    expect(streamerActive()).toBe(false);
    fireEvent.click(screen.getByRole('switch', { name: 'Streamer mode' }));
    expect(streamerActive()).toBe(true);
    expect(screen.getByRole('status').textContent).toContain('Streamer mode is active');
    expect(mergeKeybinds([]).find((k) => k.action === 'toggleStreamerMode')?.keys).toBe('');
    act(() => runKeybindAction('toggleStreamerMode'));
    expect(streamerActive()).toBe(false);
  });

  it('removes the email from an already open verification banner as mode changes', () => {
    render(<VerifyEmailBanner user={{ id: '1', username: 'me', email: 'private@example.test', verified: false } as never} />);
    expect(screen.getByText('Verify private@example.test')).toBeTruthy();
    act(() => usePrefsStore.getState().set('streamerMode', true));
    expect(screen.queryByText('Verify private@example.test')).toBeNull();
    expect(screen.getByText('Verify your email')).toBeTruthy();
  });

  it('fails closed while detecting and on errors, then follows OBS without changing manual mode', async () => {
    vi.useFakeTimers();
    obsRunning.mockResolvedValueOnce(false).mockRejectedValueOnce(new Error('unavailable')).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    usePrefsStore.setState({ streamerAutoDetect: true });
    expect(streamerActive()).toBe(true);
    let stop = () => {};
    await act(async () => { stop = startObsDetection(); });
    expect(streamerActive()).toBe(false);
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(streamerActive()).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(streamerActive()).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(streamerActive()).toBe(false);
    expect(usePrefsStore.getState().streamerMode).toBe(false);
    stop();
  });
});
