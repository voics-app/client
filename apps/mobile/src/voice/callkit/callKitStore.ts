import { create } from 'zustand';

interface CallKitState {
  /** Channels whose call the system UI shows. The app's own ring card stays hidden for them. */
  shown: string[];
  setShown(channelIds: string[]): void;
}

export const useCallKitStore = create<CallKitState>((set) => ({
  shown: [],
  setShown: (shown) => set((s) => (s.shown.length === shown.length && s.shown.every((id, i) => id === shown[i]) ? s : { shown })),
}));
