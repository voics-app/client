/** Progress and error state of private attachment transfers, keyed by attachment id. */
import { create } from 'zustand';
import type { AttachmentFailure } from '../../domain/attachmentFailure';

export type TransferState = 'encrypting' | 'uploading' | 'sending' | 'downloading' | 'receiving' | 'decrypting' | 'done' | 'error';

export interface Transfer {
  state: TransferState;
  loaded: number;
  total: number;
  error?: string;
  reason?: AttachmentFailure;
}

interface TransferStoreState {
  transfers: Record<string, Transfer>;
  update(id: string, patch: Partial<Transfer>): void;
  reset(): void;
}

export const useTransferStore = create<TransferStoreState>((set) => ({
  transfers: {},
  update: (id, patch) =>
    set((s) => ({ transfers: { ...s.transfers, [id]: { state: 'encrypting', loaded: 0, total: 0, ...s.transfers[id], ...patch } } })),
  reset: () => set({ transfers: {} }),
}));

export function fractionOf(transfer: Pick<Transfer, 'loaded' | 'total'> & Partial<Transfer> | undefined): number {
  if (!transfer || transfer.total <= 0) return 0;
  return Math.min(1, Math.max(0, transfer.loaded / transfer.total));
}
