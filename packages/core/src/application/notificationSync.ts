/** Writes of the synced notification settings and notes: optimistic, rolled back when the API refuses. */
import type { GuildNotificationSettings, GuildNotificationSettingsPatch } from '@discordy/core/contracts/rest';
import type { ApiPort } from '@discordy/core/application/ports/api';
import { useNotificationSettingsStore, useUserNotesStore } from '@discordy/core/application/stores/notificationSettingsStore';
import { emptySettings, scopeKey } from '@discordy/core/domain/notificationSettings';

type Api = Pick<ApiPort, 'updateGuildNotificationSettings' | 'putUserNote'>;

/**
 * Applies `optimistic` locally, PATCHes `patch`, then stores the server's answer. `guildId` null is DMs.
 * On failure the previous value is restored and the error rethrown.
 */
export async function saveGuildNotificationSettings(
  api: Api,
  guildId: string | null,
  patch: GuildNotificationSettingsPatch,
  optimistic: (current: GuildNotificationSettings) => GuildNotificationSettings,
): Promise<GuildNotificationSettings> {
  const store = useNotificationSettingsStore.getState();
  const previous = store.byScope[scopeKey(guildId)];
  store.upsert(optimistic(previous ?? emptySettings(guildId)));
  try {
    const saved = await api.updateGuildNotificationSettings(guildId, patch);
    useNotificationSettingsStore.getState().upsert(saved);
    return saved;
  } catch (error) {
    const state = useNotificationSettingsStore.getState();
    if (previous) state.upsert(previous);
    else state.upsert(emptySettings(guildId));
    throw error;
  }
}

/** Saves the note about `userId` (empty deletes); the local copy is restored if the API refuses. */
export async function saveUserNote(api: Api, userId: string, note: string): Promise<void> {
  const notes = useUserNotesStore.getState();
  const previous = notes.byUser[userId] ?? '';
  notes.set(userId, note);
  try {
    await api.putUserNote(userId, note);
  } catch (error) {
    useUserNotesStore.getState().set(userId, previous);
    throw error;
  }
}
