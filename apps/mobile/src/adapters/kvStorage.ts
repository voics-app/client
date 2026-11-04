import { createMemoryStorage, type KeyValueStorage } from '@discordy/core/application/ports/deviceStorage';

/** The synchronous key-value surface of `expo-sqlite/kv-store`; tests supply a fake. */
export interface KvBackend {
  getItemSync(key: string): string | null;
  setItemSync(key: string, value: string): void;
  removeItemSync(key: string): unknown;
}

/** Device storage for the persisted stores. If the native store throws, that call falls back to memory so the app keeps working. */
export function createKvStorage(backend: KvBackend): KeyValueStorage {
  const memory = createMemoryStorage();
  return {
    getItem(key) {
      try {
        return backend.getItemSync(key);
      } catch {
        return memory.getItem(key);
      }
    },
    setItem(key, value) {
      try {
        backend.setItemSync(key, value);
      } catch {
        memory.setItem(key, value);
      }
    },
    removeItem(key) {
      try {
        backend.removeItemSync(key);
      } catch {
        memory.removeItem(key);
      }
    },
  };
}
