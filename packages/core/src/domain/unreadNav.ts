/** Picks the next or previous unread channel from an ordered list, wrapping around. */
export interface NavChannel {
  id: string;
  unread: boolean;
  /** Unread mentions; used by the mentions-first option. */
  mentions?: number;
}

/**
 * With `mentionsFirst`, channels with unread mentions are walked before plain unread ones: as long as another
 * channel has mentions, only those are candidates; afterwards the plain unread channels are.
 */
export function pickUnreadChannel(list: readonly NavChannel[], currentId: string | null, delta: 1 | -1, mentionsFirst = false): string | null {
  if (list.length === 0) return null;
  const onlyMentions = mentionsFirst && list.some((c) => c.unread && (c.mentions ?? 0) > 0 && c.id !== currentId);
  const wanted = (c: NavChannel): boolean => c.unread && c.id !== currentId && (!onlyMentions || (c.mentions ?? 0) > 0);
  const start = list.findIndex((c) => c.id === currentId);
  for (let step = 1; step <= list.length; step += 1) {
    const i = (((start < 0 ? (delta === 1 ? -1 : 0) : start) + delta * step) % list.length + list.length) % list.length;
    const c = list[i]!;
    if (wanted(c)) return c.id;
  }
  return null;
}
