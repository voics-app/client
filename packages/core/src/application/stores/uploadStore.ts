/** Progress and cancellation of attachment uploads of messages being sent, keyed by the message's nonce. */
import { create } from 'zustand';

export interface Upload {
  loaded: number;
  total: number;
  /** Aborts every file of the message. */
  abort: () => void;
}

interface UploadStoreState {
  uploads: Record<string, Upload>;
  begin(nonce: string, total: number, abort: () => void): void;
  progress(nonce: string, loaded: number): void;
  end(nonce: string): void;
}

export const useUploadStore = create<UploadStoreState>((set) => ({
  uploads: {},
  begin: (nonce, total, abort) => set((s) => ({ uploads: { ...s.uploads, [nonce]: { loaded: 0, total, abort } } })),
  progress: (nonce, loaded) =>
    set((s) => {
      const current = s.uploads[nonce];
      return current ? { uploads: { ...s.uploads, [nonce]: { ...current, loaded } } } : s;
    }),
  end: (nonce) =>
    set((s) => {
      const { [nonce]: _gone, ...uploads } = s.uploads;
      return { uploads };
    }),
}));

export function uploadFraction(upload: Pick<Upload, 'loaded' | 'total'> | undefined): number {
  if (!upload || upload.total <= 0) return 0;
  return Math.min(1, Math.max(0, upload.loaded / upload.total));
}
