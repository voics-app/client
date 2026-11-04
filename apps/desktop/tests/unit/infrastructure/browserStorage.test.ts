import { describe, expect, it } from 'vitest';
import { createBrowserStorage } from '@renderer/infrastructure/storage/browserStorage';

function fakeLocalStorage(throwOnWrite = false): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      if (throwOnWrite) throw new Error('blocked');
      data.set(k, v);
    },
    removeItem: (k) => void data.delete(k),
  } as Storage;
}

describe('createBrowserStorage', () => {
  it('uses localStorage when it works and leaves no probe key behind', () => {
    const local = fakeLocalStorage();
    const storage = createBrowserStorage({ localStorage: local });
    storage.setItem('a', '1');
    expect(local.getItem('a')).toBe('1');
    expect(local.getItem('__discordy_probe__')).toBeNull();
  });

  it('falls back to memory when localStorage is absent or throws', () => {
    for (const scope of [{}, { localStorage: fakeLocalStorage(true) }]) {
      const storage = createBrowserStorage(scope);
      storage.setItem('a', '1');
      expect(storage.getItem('a')).toBe('1');
    }
  });
});
