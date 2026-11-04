import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDispatchRouter } from '@renderer/application/dispatchRouter';
import { saveGuildNotificationSettings, saveUserNote } from '@renderer/application/notificationSync';
import { useNotificationSettingsStore, useUserNotesStore } from '@discordy/core/application/stores/notificationSettingsStore';
import { emptySettings, withMute } from '@discordy/core/domain/notificationSettings';
import type { GuildNotificationSettings } from '@discordy/core/contracts/rest';

const me = { id: '1', username: 'me', global_name: 'Me', avatar: null };
const guildSettings: GuildNotificationSettings = { ...emptySettings('g'), message_notifications: 1, suppress_roles: true };
const dmSettings: GuildNotificationSettings = { ...emptySettings(null), muted: true, mute_config: { end_time: null } };

function router() {
  return createDispatchRouter({ onVoiceServerUpdate: vi.fn(), onIncomingMessage: vi.fn(), invalidate: vi.fn() });
}

describe('synced notification settings and notes', () => {
  beforeEach(() => {
    useNotificationSettingsStore.getState().reset();
    useUserNotesStore.getState().reset();
  });

  it('READY hydrates settings per scope and notes', () => {
    router()('READY', {
      v: 1,
      user: me,
      session_id: 's',
      guilds: [],
      private_channels: [],
      relationships: [],
      user_settings: {},
      user_guild_settings: [guildSettings, dmSettings],
      notes: { '2': 'hello' },
    });
    expect(useNotificationSettingsStore.getState().byScope.g).toEqual(guildSettings);
    expect(useNotificationSettingsStore.getState().byScope['@me']).toEqual(dmSettings);
    expect(useUserNotesStore.getState().byUser).toEqual({ '2': 'hello' });
  });

  it('dispatches update one scope and one note; an empty note removes it', () => {
    const route = router();
    route('USER_GUILD_SETTINGS_UPDATE', guildSettings);
    expect(useNotificationSettingsStore.getState().byScope.g?.suppress_roles).toBe(true);
    route('USER_NOTE_UPDATE', { id: '2', note: 'a' });
    expect(useUserNotesStore.getState().byUser['2']).toBe('a');
    route('USER_NOTE_UPDATE', { id: '2', note: '' });
    expect(useUserNotesStore.getState().byUser['2']).toBeUndefined();
  });

  it('saves optimistically, then keeps the server answer', async () => {
    const saved = { ...guildSettings, muted: true, mute_config: { end_time: '2026-10-20T13:00:00.000Z' } };
    const api = { updateGuildNotificationSettings: vi.fn().mockResolvedValue(saved), putUserNote: vi.fn() };
    const patch = { muted: true, mute_config: { selected_time_window: 3600 } };
    const promise = saveGuildNotificationSettings(api, 'g', patch, (c) => withMute(c, null, 3600, Date.now()));
    expect(useNotificationSettingsStore.getState().byScope.g?.muted).toBe(true);
    await promise;
    expect(api.updateGuildNotificationSettings).toHaveBeenCalledWith('g', patch);
    expect(useNotificationSettingsStore.getState().byScope.g).toEqual(saved);
  });

  it('rolls back a refused settings change and a refused note', async () => {
    useNotificationSettingsStore.getState().upsert(guildSettings);
    const api = { updateGuildNotificationSettings: vi.fn().mockRejectedValue(new Error('no')), putUserNote: vi.fn().mockRejectedValue(new Error('no')) };
    await expect(saveGuildNotificationSettings(api, 'g', { muted: true }, (c) => ({ ...c, muted: true }))).rejects.toThrow('no');
    expect(useNotificationSettingsStore.getState().byScope.g).toEqual(guildSettings);

    useUserNotesStore.getState().set('2', 'old');
    await expect(saveUserNote(api, '2', 'new')).rejects.toThrow('no');
    expect(useUserNotesStore.getState().byUser['2']).toBe('old');
  });
});
