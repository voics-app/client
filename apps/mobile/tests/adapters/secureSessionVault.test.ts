import { createSecureSessionVault, SESSION_KEY, type SecureBackend } from '../../src/adapters/secureSessionVault';

function fakeBackend(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const backend: SecureBackend = {
    getItemAsync: async (key) => data.get(key) ?? null,
    setItemAsync: async (key, value) => void data.set(key, value),
    deleteItemAsync: async (key) => void data.delete(key),
  };
  return { backend, data };
}

const session = { accessToken: 'a', refreshToken: 'r', userId: '1', deviceId: null };

describe('secure session vault', () => {
  it('round-trips a session', async () => {
    const { backend } = fakeBackend();
    const vault = createSecureSessionVault(backend);
    expect(await vault.load()).toBeNull();
    await vault.save(session);
    expect(await vault.load()).toEqual(session);
  });

  it('clears the session', async () => {
    const { backend, data } = fakeBackend({ [SESSION_KEY]: JSON.stringify(session) });
    const vault = createSecureSessionVault(backend);
    await vault.clear();
    expect(data.size).toBe(0);
    expect(await vault.load()).toBeNull();
  });

  it.each(['not json', '{"accessToken":1}', 'null', '[]'])('drops a damaged entry (%s) and reads as signed out', async (raw) => {
    const { backend, data } = fakeBackend({ [SESSION_KEY]: raw });
    const vault = createSecureSessionVault(backend);
    expect(await vault.load()).toBeNull();
    expect(data.has(SESSION_KEY)).toBe(false);
  });
});
