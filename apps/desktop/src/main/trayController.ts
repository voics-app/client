/** Owns the lifetime of the system tray: created and removed as the "Show in system tray" setting changes. */
import type { BrowserWindow } from 'electron';
import type { ActivityCounts, DesktopSettings, VoiceState } from '../shared/ipc';
import { shouldShowTray } from './desktop/desktopSettings';
import { createTray, type TrayActions, type TrayHandle } from './tray';

export interface TrayController {
  /** The live tray, or null while it is switched off. */
  handle(): TrayHandle | null;
  apply(settings: DesktopSettings): void;
  setActivity(counts: ActivityCounts): void;
  setVoice(state: VoiceState): void;
  setLocale(locale: string): void;
}

export function createTrayController(options: {
  getWindow: () => BrowserWindow | null;
  actions: TrayActions;
  e2e: boolean;
  /** Re-applies the unread state to a freshly created tray (icon variant and tooltip). */
  onCreated: (counts: ActivityCounts) => void;
  locale?: string;
}): TrayController {
  let tray: TrayHandle | null = null;
  let activity: ActivityCounts = { mentions: 0, unread: 0 };
  let voice: VoiceState = { muted: false, deafened: false };
  let locale = options.locale ?? 'en-US';
  return {
    handle: () => tray,
    apply(settings) {
      const wanted = shouldShowTray(settings, options.e2e);
      if (wanted && !tray) {
        tray = createTray(options.getWindow, options.actions);
        tray.setLocale(locale);
        tray.setActivity(activity);
        tray.setVoice(voice);
        options.onCreated(activity);
      } else if (!wanted && tray) {
        tray.destroy();
        tray = null;
        // A window hidden to the tray would otherwise be unreachable.
        const window = options.getWindow();
        if (window && !window.isVisible()) window.show();
      }
    },
    setActivity(counts) {
      activity = counts;
      tray?.setActivity(counts);
    },
    setVoice(state) {
      voice = state;
      tray?.setVoice(state);
    },
    setLocale(next) {
      locale = next;
      tray?.setLocale(locale);
    },
  };
}
