/** Access to the Electron preload bridge with an in-memory fallback so the renderer also runs in a plain browser (gallery, dev). */
import type { AppInfo, DiscordyBridge, StoredSession } from '@shared/ipc';

export const bridge: DiscordyBridge | undefined = typeof window === 'undefined' ? undefined : window.discordy;

let memorySession: StoredSession | null = null;

export const sessionVault = {
  load: async (): Promise<StoredSession | null> => (bridge ? bridge.session.load() : memorySession),
  save: async (session: StoredSession): Promise<void> => {
    if (bridge) await bridge.session.save(session);
    else memorySession = session;
  },
  clear: async (): Promise<void> => {
    if (bridge) await bridge.session.clear();
    else memorySession = null;
  },
};

const BROWSER_INFO: AppInfo = {
  version: '0.1.0-browser',
  platform: 'web',
  updateFeedUrl: '',
  e2eTest: false,
  connection: {
    id: 'local',
    apiUrl: 'http://localhost:8000',
    gatewayUrl: 'ws://localhost:8000',
    cdnUrl: 'http://localhost:8000/cdn',
  },
};

export const loadAppInfo = (): Promise<AppInfo> => (bridge ? bridge.app.info() : Promise.resolve(BROWSER_INFO));
