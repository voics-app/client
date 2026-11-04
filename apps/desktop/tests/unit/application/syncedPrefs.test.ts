import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDispatchRouter } from '@renderer/application/dispatchRouter';
import { PrefsSync } from '@discordy/core/application/syncedPrefs';
import { fromServer, toServerPatch, SYNCED_KEYS } from '@discordy/core/application/syncedPrefsMap';
import { DEFAULT_PREFS, usePrefsStore } from '@discordy/core/application/stores/prefsStore';

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

function setup(updateSettings = vi.fn().mockResolvedValue({})) {
  const onError = vi.fn();
  const storage = memory();
  const sync = new PrefsSync({ updateSettings, onError, debounceMs: 100, storage });
  sync.start();
  return { sync, updateSettings, onError, storage };
}

describe('synced preference mapping', () => {
  it('maps server settings to client prefs and back', () => {
    const server = { theme: 'light' as const, message_display_compact: true, preferences: { accent: 'sky' as const, font_scale: 1.25, bogus: 1 } };
    expect(fromServer(server as never)).toEqual({ theme: 'light', density: 'compact', accent: 'sky', fontScale: 1.25 });
    const patch = toServerPatch(['theme', 'density', 'fontScale', 'notifySounds'], { ...DEFAULT_PREFS, theme: 'oled', density: 'compact', fontScale: 1.1, notifySounds: false });
    expect(patch).toEqual({ theme: 'oled', message_display_compact: true, preferences: { font_scale: 1.1, notify_sounds: false } });
  });

  it('maps the appearance and accessibility keys and keeps device-only ones local', () => {
    const server = { preferences: { saturation: 0.5, role_colors: 'dot', link_underline: true, message_spacing: 8, high_contrast: true, animate_gifs: false, animate_emoji: false, animate_stickers: false, tts_read_aloud: true, tts_rate: 1.5 } };
    const prefs = fromServer(server as never);
    expect(prefs).toEqual({ saturation: 0.5, roleColors: 'dot', linkUnderline: true, messageSpacing: 8, highContrast: true, animateGifs: false, animateEmoji: false, animateStickers: false, ttsReadAloud: true, ttsRate: 1.5 });
    expect(toServerPatch(['roleColors', 'messageSpacing'], { ...DEFAULT_PREFS, roleColors: 'hidden', messageSpacing: 4 })).toEqual({ preferences: { role_colors: 'hidden', message_spacing: 4 } });
    expect(fromServer({ preferences: { saturation: 2, role_colors: 'bold', message_spacing: 1.5, tts_rate: 5 } } as never)).toEqual({});
    for (const local of ['zoom', 'syncOsTheme', 'syncOsMotion', 'channelListDensity']) expect(SYNCED_KEYS).not.toContain(local);
  });

  it('ignores malformed server values', () => {
    expect(fromServer({ theme: 'neon', preferences: { accent: 'teal', font_scale: 9, reduce_motion: 'yes' } } as never)).toEqual({});
  });

  it('keeps devices, volumes and keybinds out of the synced set', () => {
    for (const local of ['inputDeviceId', 'outputDeviceId', 'inputVolume', 'outputVolume', 'keybinds', 'pttKeycode', 'notifyDesktop', 'flashTaskbar', 'mediaVolume']) {
      expect(SYNCED_KEYS).not.toContain(local);
    }
  });
});

describe('PrefsSync', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    usePrefsStore.setState({ ...DEFAULT_PREFS });
  });
  afterEach(() => vi.useRealTimers());

  it('sends one debounced PATCH with only the changed keys', async () => {
    const { sync, updateSettings } = setup();
    sync.onSettings({ theme: 'dark', preferences: {} }, true, 'u1');
    usePrefsStore.getState().set('fontScale', 1.1);
    usePrefsStore.getState().set('fontScale', 1.2);
    usePrefsStore.getState().set('theme', 'light');
    expect(updateSettings).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(150);
    expect(updateSettings).toHaveBeenCalledTimes(1);
    expect(updateSettings).toHaveBeenCalledWith({ theme: 'light', preferences: { font_scale: 1.2 } });
    await vi.advanceTimersByTimeAsync(500);
    expect(updateSettings).toHaveBeenCalledTimes(1);
    sync.stop();
  });

  it('does not sync device-local prefs', async () => {
    const { sync, updateSettings } = setup();
    sync.onSettings({ theme: 'dark', preferences: {} }, true, 'u1');
    usePrefsStore.getState().set('inputVolume', 0.5);
    usePrefsStore.getState().set('notifyDesktop', false);
    await vi.advanceTimersByTimeAsync(500);
    expect(updateSettings).not.toHaveBeenCalled();
    sync.stop();
  });

  it('rolls a refused change back and reports it', async () => {
    const { sync, onError } = setup(vi.fn().mockRejectedValue(new Error('no')));
    sync.onSettings({ theme: 'dark', preferences: { accent: 'rose' } }, true, 'u1');
    expect(usePrefsStore.getState().accent).toBe('rose');
    usePrefsStore.getState().set('accent', 'sky');
    await vi.advanceTimersByTimeAsync(150);
    expect(usePrefsStore.getState().accent).toBe('rose');
    expect(onError).toHaveBeenCalledTimes(1);
    sync.stop();
  });

  it('applies server values from READY and USER_SETTINGS_UPDATE without echoing them back', async () => {
    const { sync, updateSettings } = setup();
    sync.onSettings({ theme: 'oled', message_display_compact: true, preferences: { notify_sounds: false } }, true, 'u1');
    expect(usePrefsStore.getState()).toMatchObject({ theme: 'oled', density: 'compact', notifySounds: false });
    sync.onSettings({ theme: 'oled', preferences: { accent: 'ember' } }, false);
    expect(usePrefsStore.getState().accent).toBe('ember');
    await vi.advanceTimersByTimeAsync(500);
    expect(updateSettings).not.toHaveBeenCalled();
    sync.stop();
  });

  it('keeps a local edit that is still pending when a dispatch arrives', async () => {
    const { sync, updateSettings } = setup();
    sync.onSettings({ theme: 'dark', preferences: { font_scale: 1 } }, true, 'u1');
    usePrefsStore.getState().set('fontScale', 1.3);
    sync.onSettings({ theme: 'dark', preferences: { font_scale: 1 } }, false);
    expect(usePrefsStore.getState().fontScale).toBe(1.3);
    await vi.advanceTimersByTimeAsync(150);
    expect(updateSettings).toHaveBeenCalledWith({ preferences: { font_scale: 1.3 } });
    sync.stop();
  });

  it('migrates local values once on first run when the server has none', async () => {
    usePrefsStore.setState({ theme: 'light', accent: 'sky', fontScale: 1.2 });
    const { sync, updateSettings } = setup();
    sync.onSettings({ theme: 'dark', message_display_compact: false, preferences: { accent: 'rose' } }, true, 'u1');
    // server has an accent already, so it wins; theme and font scale are migrated up
    expect(usePrefsStore.getState()).toMatchObject({ theme: 'light', accent: 'rose', fontScale: 1.2 });
    await vi.advanceTimersByTimeAsync(150);
    expect(updateSettings).toHaveBeenCalledWith({ theme: 'light', preferences: { font_scale: 1.2 } });
    sync.stop();

    // a second READY for the same account never migrates again: the server value wins
    usePrefsStore.setState({ theme: 'oled' });
    const again = setup();
    again.storage.setItem('discordy.prefs-sync.migrated.u1', '1');
    again.sync.onSettings({ theme: 'dark', preferences: {} }, true, 'u1');
    expect(usePrefsStore.getState().theme).toBe('dark');
    again.sync.stop();
  });

  it('wires into the dispatch router', () => {
    const onUserSettings = vi.fn();
    const route = createDispatchRouter({ onVoiceServerUpdate: vi.fn(), onIncomingMessage: vi.fn(), invalidate: vi.fn(), onUserSettings });
    route('READY', { v: 1, user: { id: '1', username: 'me', global_name: 'Me', avatar: null }, session_id: 's', guilds: [], private_channels: [], relationships: [], user_settings: { theme: 'light' } });
    expect(onUserSettings).toHaveBeenCalledWith({ theme: 'light' }, true, '1');
    route('USER_SETTINGS_UPDATE', { preferences: { accent: 'sky' } });
    expect(onUserSettings).toHaveBeenLastCalledWith({ preferences: { accent: 'sky' } }, false);
  });
});
