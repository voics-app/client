import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { persistedStorage } from '@discordy/core/application/ports/deviceStorage';
import type { PushStatus } from './pushModel';

/** Device-local push settings, kept across launches. */
interface PushPrefsState {
  /** The permission was offered once (accepted or refused); the app does not offer it again. */
  offered: boolean;
  /** Pushes of standard messages may show a text preview. */
  previews: boolean;
  markOffered(): void;
  setPreviews(previews: boolean): void;
}

export const usePushPrefs = create<PushPrefsState>()(
  persist(
    (set) => ({
      offered: false,
      previews: true,
      markOffered: () => set({ offered: true }),
      setPreviews: (previews) => set({ previews }),
    }),
    { name: 'discordy.push.v1', storage: persistedStorage() },
  ),
);

/** What the settings page shows right now; it is not persisted, the controller refreshes it. */
interface PushStatusState {
  status: PushStatus;
  setStatus(status: PushStatus): void;
}

export const usePushStatus = create<PushStatusState>((set) => ({
  status: 'unavailable',
  setStatus: (status) => set({ status }),
}));
