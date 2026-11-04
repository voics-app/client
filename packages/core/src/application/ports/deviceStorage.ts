/**
 * Port for synchronous device-local key-value storage (localStorage on desktop, a native store on mobile).
 * Stores persist through `deviceStorage`, which forwards to whatever adapter the composition root installed
 * before the stores were imported; until then it is in-memory.
 */
import { createJSONStorage } from 'zustand/middleware';

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function createMemoryStorage(): KeyValueStorage {
  const memory = new Map<string, string>();
  return {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => void memory.set(key, value),
    removeItem: (key) => void memory.delete(key),
  };
}

let adapter: KeyValueStorage = createMemoryStorage();

export function installDeviceStorage(next: KeyValueStorage): void {
  adapter = next;
}

export const deviceStorage: KeyValueStorage = {
  getItem: (key) => adapter.getItem(key),
  setItem: (key, value) => adapter.setItem(key, value),
  removeItem: (key) => adapter.removeItem(key),
};

/** The `storage` option for zustand `persist`, backed by the installed device storage. */
export function persistedStorage<S>() {
  return createJSONStorage<S>(() => deviceStorage);
}
