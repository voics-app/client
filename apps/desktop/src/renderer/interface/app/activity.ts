import { useEffect } from 'react';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useReadStateStore } from '@discordy/core/application/stores/peopleStores';
import { usePrefsStore } from '@discordy/core/application/stores/prefsStore';
import { bridge } from './bridge';
import { currentActivity } from './notifications';

/** Pushes unread/mention totals to the main process (taskbar overlay, tray, window title) whenever they change. */
export function useActivityReporting(): void {
  useEffect(() => {
    let last = '';
    const push = () => {
      const counts = currentActivity();
      const key = `${counts.mentions}:${counts.unread}`;
      if (key === last) return;
      last = key;
      bridge?.app.setActivity(counts);
    };
    push();
    const unsubs = [useGuildStore.subscribe(push), useReadStateStore.subscribe(push), usePrefsStore.subscribe(push)];
    return () => unsubs.forEach((u) => u());
  }, []);
}
