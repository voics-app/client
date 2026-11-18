import { create } from 'zustand';
import { useLightboxStore } from './lightboxStore';
import { speech } from '../ports/speech';

interface AgeRestrictedState {
  instance: string | null;
  generation: number;
  confirmations: Record<string, string>;
}

/** Deliberately memory-only: a restart or sign-out requires acknowledgement again. */
export const useAgeRestrictedStore = create<AgeRestrictedState>(() => ({ instance: null, generation: 0, confirmations: {} }));

export function clearAgeRestrictedConfirmations(): void {
  useLightboxStore.getState().close();
  speech.cancel();
  useAgeRestrictedStore.setState((s) => ({ confirmations: {}, generation: s.generation + 1 }));
}
