/** The image/video viewer: the items of one message (or embed) and which one is open. */
import { create } from 'zustand';
import { stepIndex } from '../../domain/media';

export interface LightboxItem {
  kind: 'image' | 'video';
  /** What to display. */
  src: string;
  /** Opens the original in the browser; the displayed source when there is no better one. */
  original: string;
  /** Other URLs of the same image, tried in order when `src` fails to load. */
  fallbacks?: string[];
  filename: string;
  description?: string;
  width?: number | null;
  height?: number | null;
}

interface LightboxState {
  items: LightboxItem[];
  index: number;
  open(items: LightboxItem[], index?: number): void;
  step(delta: number): void;
  close(): void;
}

export const useLightboxStore = create<LightboxState>((set) => ({
  items: [],
  index: 0,
  open: (items, index = 0) => set(items.length === 0 ? { items: [], index: 0 } : { items, index: Math.min(Math.max(0, index), items.length - 1) }),
  step: (delta) => set((s) => ({ index: stepIndex(s.index, s.items.length, delta) })),
  close: () => set({ items: [], index: 0 }),
}));
