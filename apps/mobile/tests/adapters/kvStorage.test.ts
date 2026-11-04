import { createKvStorage, type KvBackend } from '../../src/adapters/kvStorage';

describe('kv storage adapter', () => {
  it('reads, writes and removes through the backend', () => {
    const data = new Map<string, string>();
    const backend: KvBackend = {
      getItemSync: (k) => data.get(k) ?? null,
      setItemSync: (k, v) => void data.set(k, v),
      removeItemSync: (k) => data.delete(k),
    };
    const storage = createKvStorage(backend);
    storage.setItem('a', '1');
    expect(data.get('a')).toBe('1');
    expect(storage.getItem('a')).toBe('1');
    storage.removeItem('a');
    expect(storage.getItem('a')).toBeNull();
  });

  it('falls back to memory when the native store throws', () => {
    const boom = () => {
      throw new Error('native store unavailable');
    };
    const storage = createKvStorage({ getItemSync: boom, setItemSync: boom, removeItemSync: boom });
    storage.setItem('a', '1');
    expect(storage.getItem('a')).toBe('1');
    storage.removeItem('a');
    expect(storage.getItem('a')).toBeNull();
  });
});
