import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionManager, type SessionVault, type SessionRuntime } from '@renderer/application/sessionManager';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import type { StoredSession } from '@shared/ipc';

const user = { id: '1', username: 'ada', global_name: null, avatar: null };

function vault(initial: StoredSession | null = null): SessionVault & { saved: StoredSession | null } {
  const v = {
    saved: initial,
    load: vi.fn(async () => v.saved),
    save: vi.fn(async (s: StoredSession) => {
      v.saved = s;
    }),
    clear: vi.fn(async () => {
      v.saved = null;
    }),
  };
  return v;
}

function runtime(): SessionRuntime & { connect: ReturnType<typeof vi.fn> } {
  return {
    api: {
      login: vi.fn(async () => ({ access_token: 'a1', refresh_token: 'r1', user })),
      register: vi.fn(async () => ({ access_token: 'a1', refresh_token: 'r1', user })),
      logout: vi.fn(async () => undefined),
      me: vi.fn(async () => user),
      registerDevice: vi.fn(async () => ({ device_id: 'dev1' })),
    } as unknown as SessionRuntime['api'],
    connect: vi.fn(),
    disconnect: vi.fn(),
    setTokens: vi.fn(),
  };
}

describe('SessionManager', () => {
  beforeEach(() => useSessionStore.getState().reset());

  it('boots to signedOut when nothing is stored', async () => {
    const m = new SessionManager({ vault: vault(), runtime: runtime(), identity: async () => null });
    await m.boot();
    expect(useSessionStore.getState().status).toBe('signedOut');
  });

  it('resumes a stored session and connects the gateway', async () => {
    const rt = runtime();
    const m = new SessionManager({
      vault: vault({ accessToken: 'a', refreshToken: 'r', userId: '1', deviceId: 'dev0' }),
      runtime: rt,
      identity: async () => ({ identityKeyB64: 'key' }),
    });
    await m.boot();
    expect(rt.setTokens).toHaveBeenCalledWith({ access: 'a', refresh: 'r' });
    expect(rt.connect).toHaveBeenCalled();
    expect(useSessionStore.getState().status).toBe('connecting');
    expect(useSessionStore.getState().deviceId).toBe('dev0');
  });

  it('logs in, registers a device when an identity exists, and persists the session', async () => {
    const v = vault();
    const rt = runtime();
    const m = new SessionManager({ vault: v, runtime: rt, identity: async () => ({ identityKeyB64: 'key' }) });
    await m.login({ email: 'a@b.c', password: 'pw' });
    expect(rt.api.registerDevice).toHaveBeenCalledWith({ name: expect.any(String), identity_key_b64: 'key' });
    expect(v.saved).toMatchObject({ accessToken: 'a1', refreshToken: 'r1', userId: '1', deviceId: 'dev1' });
    expect(rt.connect).toHaveBeenCalled();
  });

  it('signs in when device registration fails, without a device, and reports it', async () => {
    const v = vault();
    const rt = runtime();
    const failure = new Error('Maximum number of devices reached.');
    (rt.api.registerDevice as ReturnType<typeof vi.fn>).mockRejectedValue(failure);
    const onDeviceRegistrationFailed = vi.fn();
    const m = new SessionManager({
      vault: v,
      runtime: rt,
      identity: async () => ({ identityKeyB64: 'key' }),
      onDeviceRegistrationFailed,
    });
    await m.login({ email: 'a@b.c', password: 'pw' });
    expect(useSessionStore.getState().user?.id).toBe('1');
    expect(useSessionStore.getState().status).toBe('connecting');
    expect(useSessionStore.getState().deviceId).toBeNull();
    expect(v.saved).toMatchObject({ accessToken: 'a1', userId: '1', deviceId: null });
    expect(rt.connect).toHaveBeenCalled();
    expect(onDeviceRegistrationFailed).toHaveBeenCalledWith(failure);
  });

  it('works without a native crypto identity (standard mode only)', async () => {
    const rt = runtime();
    const m = new SessionManager({ vault: vault(), runtime: rt, identity: async () => null });
    await m.register({ email: 'a@b.c', username: 'ada', password: 'pw' });
    expect(rt.api.registerDevice).not.toHaveBeenCalled();
    expect(useSessionStore.getState().deviceId).toBeNull();
  });

  it('clears everything on logout even when the server call fails', async () => {
    const v = vault({ accessToken: 'a', refreshToken: 'r', userId: '1', deviceId: null });
    const rt = runtime();
    (rt.api.logout as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('offline'));
    const m = new SessionManager({ vault: v, runtime: rt, identity: async () => null });
    await m.boot();
    useGuildStore.setState({ order: ['g'] });
    await m.logout();
    expect(v.saved).toBeNull();
    expect(rt.disconnect).toHaveBeenCalled();
    expect(useSessionStore.getState().status).toBe('signedOut');
    expect(useGuildStore.getState().order).toEqual([]);
  });

  it('signs out when the server rejects the session as expired', async () => {
    const v = vault({ accessToken: 'a', refreshToken: 'r', userId: '1', deviceId: null });
    const m = new SessionManager({ vault: v, runtime: runtime(), identity: async () => null });
    await m.boot();
    await m.sessionExpired();
    expect(useSessionStore.getState().status).toBe('signedOut');
    expect(v.saved).toBeNull();
  });
});
