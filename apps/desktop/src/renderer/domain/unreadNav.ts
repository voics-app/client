/** Picks the next or previous unread channel from an ordered list, wrapping around. */
export interface NavChannel {
  id: string;
  unread: boolean;
}

export function pickUnreadChannel(list: readonly NavChannel[], currentId: string | null, delta: 1 | -1): string | null {
  if (list.length === 0) return null;
  const start = list.findIndex((c) => c.id === currentId);
  for (let step = 1; step <= list.length; step += 1) {
    const i = (((start < 0 ? (delta === 1 ? -1 : 0) : start) + delta * step) % list.length + list.length) % list.length;
    const c = list[i]!;
    if (c.unread && c.id !== currentId) return c.id;
  }
  return null;
}
