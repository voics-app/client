/** Tracks pages with unsaved edits so closing settings can be blocked and the bar can shake (client#89). */
import { create } from 'zustand';
import { useUiStore } from './uiStore';

interface UnsavedState {
  /** Ids of the pages that currently hold unsaved edits. */
  sources: Record<string, true>;
  /** Bumped on every blocked close; the bar replays its shake animation when it changes. */
  shake: number;
  /** An Escape press was already blocked, so the next one may discard the edits. */
  escBlocked: boolean;
  setDirty(id: string, dirty: boolean): void;
  /**
   * Asks to leave the page. Returns true when leaving is allowed (nothing unsaved, or a second Escape).
   * The close button and tab changes never override: they shake until Save or Reset.
   */
  requestLeave(viaEsc?: boolean): boolean;
}

export const hasUnsaved = (s: Pick<UnsavedState, 'sources'>): boolean => Object.keys(s.sources).length > 0;

export const useUnsavedStore = create<UnsavedState>((set, get) => ({
  sources: {},
  shake: 0,
  escBlocked: false,
  setDirty: (id, dirty) =>
    set((s) => {
      if (dirty === Boolean(s.sources[id])) return s;
      const sources = { ...s.sources };
      if (dirty) sources[id] = true;
      else delete sources[id];
      return { sources, escBlocked: Object.keys(sources).length === 0 ? false : s.escBlocked };
    }),
  requestLeave: (viaEsc = false) => {
    const s = get();
    if (!hasUnsaved(s)) return true;
    if (viaEsc && s.escBlocked) {
      set({ sources: {}, escBlocked: false });
      return true;
    }
    set({ shake: s.shake + 1, escBlocked: viaEsc ? true : s.escBlocked });
    return false;
  },
}));

/** Closes settings unless a page holds unsaved edits. */
export function closeSettings(viaEsc = false): void {
  if (useUnsavedStore.getState().requestLeave(viaEsc)) useUiStore.getState().openSettings(null);
}
