import { create } from 'zustand';

/** Endpoints of the active connection profile, mirrored from the main process for URL building. */
export const useConnectionStore = create<{ apiUrl: string; gatewayUrl: string; cdnUrl: string; runtimeVersion: number; set(v: { apiUrl: string; gatewayUrl: string; cdnUrl: string }): void }>((set) => ({
  apiUrl: '',
  gatewayUrl: '',
  cdnUrl: '',
  // A replacement runtime at the same URL still invalidates outstanding UI continuations.
  runtimeVersion: 0,
  set: (v) => set((state) => ({ ...v, runtimeVersion: state.runtimeVersion + 1 })),
}));
