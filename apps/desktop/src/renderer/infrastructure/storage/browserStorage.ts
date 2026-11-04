import { createMemoryStorage, type KeyValueStorage } from '@renderer/application/ports/deviceStorage';

const PROBE = '__discordy_probe__';

/** localStorage can be absent or throw (private windows, blocked storage); fall back to memory. */
export function createBrowserStorage(scope: { localStorage?: Storage } = globalThis): KeyValueStorage {
  try {
    const storage = scope.localStorage;
    if (!storage) return createMemoryStorage();
    storage.setItem(PROBE, '1');
    storage.removeItem(PROBE);
    return storage;
  } catch {
    return createMemoryStorage();
  }
}
