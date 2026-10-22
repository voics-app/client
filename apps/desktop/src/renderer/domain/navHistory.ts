/** Back/forward history of visited views (Alt+Left / Alt+Right), like a browser's, kept in memory only. */
export interface NavHistory<V> {
  entries: V[];
  index: number;
}

const LIMIT = 50;

export const emptyHistory = <V>(): NavHistory<V> => ({ entries: [], index: -1 });

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Records a new view; visiting from the middle drops the forward entries. */
export function pushView<V>(h: NavHistory<V>, view: V): NavHistory<V> {
  if (h.index >= 0 && same(h.entries[h.index], view)) return h;
  const entries = [...h.entries.slice(0, h.index + 1), view].slice(-LIMIT);
  return { entries, index: entries.length - 1 };
}

export const canGo = <V>(h: NavHistory<V>, delta: 1 | -1): boolean => h.index + delta >= 0 && h.index + delta < h.entries.length;

export function stepHistory<V>(h: NavHistory<V>, delta: 1 | -1): NavHistory<V> {
  return canGo(h, delta) ? { ...h, index: h.index + delta } : h;
}
