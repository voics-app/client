import { create } from 'zustand';
import type { User, UserSettings } from '@shared/contracts/rest';
import type { AppInfo } from '@shared/ipc';
import type { GatewayState } from '../ports/gateway';

export type SessionStatus = 'booting' | 'signedOut' | 'connecting' | 'ready';

export interface SessionState {
  status: SessionStatus;
  user: User | null;
  deviceId: string | null;
  identityKeyB64: string | null;
  sessionId: string | null;
  gateway: GatewayState;
  settings: UserSettings;
  appInfo: AppInfo | null;
  fatalError: string | null;
  setStatus(status: SessionStatus): void;
  setUser(user: User | null): void;
  setDevice(deviceId: string | null, identityKeyB64: string | null): void;
  setGateway(state: GatewayState): void;
  setSettings(settings: Partial<UserSettings>): void;
  setAppInfo(info: AppInfo): void;
  setFatal(message: string | null): void;
  reset(): void;
}

export const DEFAULT_SETTINGS: UserSettings = {
  default_delivery_mode: 'standard',
  e2ee_calls_default: false,
  status: 'online',
  custom_status: null,
  delivery_overrides: {},
};

export const useSessionStore = create<SessionState>((set) => ({
  status: 'booting',
  user: null,
  deviceId: null,
  identityKeyB64: null,
  sessionId: null,
  gateway: 'idle',
  settings: DEFAULT_SETTINGS,
  appInfo: null,
  fatalError: null,
  setStatus: (status) => set({ status }),
  setUser: (user) => set({ user }),
  setDevice: (deviceId, identityKeyB64) => set({ deviceId, identityKeyB64 }),
  setGateway: (gateway) => set({ gateway }),
  setSettings: (settings) => set((s) => ({ settings: { ...s.settings, ...settings } })),
  setAppInfo: (appInfo) => set({ appInfo }),
  setFatal: (fatalError) => set({ fatalError }),
  reset: () =>
    set({ status: 'signedOut', user: null, deviceId: null, identityKeyB64: null, sessionId: null, gateway: 'idle', settings: DEFAULT_SETTINGS }),
}));

export const currentUserId = (): string | null => useSessionStore.getState().user?.id ?? null;
