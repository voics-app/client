// The native key-value store does not exist under Jest; an in-memory one stands in for it.
jest.mock('expo-sqlite/kv-store', () => {
  const data = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItemSync: (key: string) => data.get(key) ?? null,
      setItemSync: (key: string, value: string) => void data.set(key, value),
      removeItemSync: (key: string) => data.delete(key),
    },
  };
});
