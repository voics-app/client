import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { errorMessage } from '@discordy/core/application/errorMessage';
import type { ScheduledMessages } from '@discordy/core/application/scheduledMessages';

const REFRESH_INTERVAL = 15_000;

/** Shared view behavior; hosts supply foreground visibility instead of web/native globals. */
export function useScheduledMessages(manager: ScheduledMessages, channelId: string, active: boolean) {
  const records = useSyncExternalStore(manager.subscribe, manager.snapshot, manager.snapshot);
  const [page, setPage] = useState<{ ids: string[]; next: string | null; busy: boolean; error: string | null }>({ ids: [], next: null, busy: false, error: null });
  const generation = useRef(0);
  const busy = useRef(false);
  const pinned = useRef(new Set<string>());

  const load = useCallback(async (after?: string, append = false) => {
    const request = ++generation.current;
    busy.current = true;
    setPage((current) => ({ ...current, busy: true, error: null }));
    try {
      const visited = new Set<string>();
      let cursor = after;
      let result;
      do {
        if (visited.has(cursor ?? '')) throw new Error('The next scheduled-message page did not advance. Try refreshing.');
        visited.add(cursor ?? '');
        result = await manager.page(channelId, cursor);
        if (request !== generation.current) return;
        cursor = result.next_after ?? undefined;
      } while (result.items.length === 0 && result.next_after !== null);
      setPage((current) => ({ ids: [...new Set([...(append ? current.ids : []), ...result.items.map((item) => item.id), ...pinned.current])], next: result.next_after, busy: false, error: null }));
    } catch (error) {
      if (request === generation.current) setPage((current) => ({ ...current, busy: false, error: errorMessage(error) }));
    } finally { if (request === generation.current) busy.current = false; }
  }, [manager, channelId]);

  useEffect(() => {
    if (!active) return;
    void load();
    const timer = setInterval(() => { if (!busy.current) void load(); }, REFRESH_INTERVAL);
    return () => { generation.current += 1; clearInterval(timer); };
  }, [active, load]);

  const include = (id: string) => {
    pinned.current.add(id);
    setPage((current) => ({ ...current, ids: [...new Set([...current.ids, id])] }));
  };
  const items = useMemo(() => page.ids.map((id) => records[id]).filter((item) => item !== undefined).sort((a, b) => {
    const aActive = a.status === 'pending' || a.status === 'dispatching';
    const bActive = b.status === 'pending' || b.status === 'dispatching';
    if (aActive !== bActive) return aActive ? -1 : 1;
    return aActive ? a.scheduled_at.localeCompare(b.scheduled_at) : b.updated_at.localeCompare(a.updated_at);
  }), [page.ids, records]);
  const refresh = useCallback(() => load(), [load]);
  const loadMore = useCallback(() => page.next ? load(page.next, true) : Promise.resolve(), [load, page.next]);
  return { ...page, items, include, refresh, loadMore };
}
