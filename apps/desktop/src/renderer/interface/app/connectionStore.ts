import { create } from 'zustand';

/** Endpoints of the active connection profile, mirrored from the main process for URL building. */
export const useConnectionStore = create<{ apiUrl: string; gatewayUrl: string; cdnUrl: string; set(v: { apiUrl: string; gatewayUrl: string; cdnUrl: string }): void }>((set) => ({
  apiUrl: '',
  gatewayUrl: '',
  cdnUrl: '',
  set: (v) => set(v),
}));
