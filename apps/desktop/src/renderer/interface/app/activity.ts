import { useEffect } from 'react';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useReadStateStore } from '@discordy/core/application/stores/peopleStores';
import { usePrefsStore } from '@discordy/core/application/stores/prefsStore';
import { useNotificationSettingsStore } from '@discordy/core/application/stores/notificationSettingsStore';
import { bridge } from './bridge';
import { currentActivity } from './notifications';

/** Pushes unread/mention totals to the main process (taskbar overlay, tray, window title) whenever they change. */
export function useActivityReporting(): void {
  useEffect(() => {
    let last = '';
    let muteExpiry: ReturnType<typeof setTimeout> | undefined;
    const push = () => {
      clearTimeout(muteExpiry);
      const now = Date.now();
      const ends = Object.values(useNotificationSettingsStore.getState().byScope)
        .flatMap((settings) => [settings, ...settings.channel_overrides])
        .filter((settings) => settings.muted && settings.mute_config?.end_time)
        .map((settings) => Date.parse(settings.mute_config!.end_time!))
        .filter((end) => end > now);
      // Expiring a mute changes activity even when no store receives another event.
      if (ends.length) muteExpiry = setTimeout(push, Math.min(Math.min(...ends) - now, 2_147_483_647));
      const counts = currentActivity();
      const key = `${counts.mentions}:${counts.unread}`;
      if (key === last) return;
      last = key;
      bridge?.app.setActivity(counts);
    };
    push();
    const unsubs = [useGuildStore.subscribe(push), useReadStateStore.subscribe(push), usePrefsStore.subscribe(push), useNotificationSettingsStore.subscribe(push)];
    return () => {
      clearTimeout(muteExpiry);
      unsubs.forEach((u) => u());
    };
  }, []);
}
