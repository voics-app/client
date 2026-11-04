import { create } from 'zustand';
import type { UpdateStatus } from '../../domain/updateStatus';

interface UpdateStoreState {
  status: UpdateStatus;
  /** Version whose banner the user dismissed; a newer version shows again. */
  dismissed: string | null;
  setStatus(status: UpdateStatus): void;
  dismiss(version: string): void;
}

export const useUpdateStore = create<UpdateStoreState>((set) => ({
  status: { state: 'idle' },
  dismissed: null,
  setStatus: (status) => set({ status }),
  dismiss: (version) => set({ dismissed: version }),
}));

export type BannerModel =
  | { kind: 'available'; version: string }
  | { kind: 'downloading'; percent: number }
  | { kind: 'ready'; version: string; notes?: string };

/** What the in-app update banner shows for a status; null when nothing needs the user's attention. */
export function bannerFor(status: UpdateStatus, dismissed: string | null): BannerModel | null {
  switch (status.state) {
    case 'available':
      return dismissed === status.version ? null : { kind: 'available', version: status.version };
    case 'downloading':
      return { kind: 'downloading', percent: status.percent };
    case 'downloaded':
      return dismissed === status.version ? null : { kind: 'ready', version: status.version, notes: status.notes };
    default:
      return null;
  }
}
