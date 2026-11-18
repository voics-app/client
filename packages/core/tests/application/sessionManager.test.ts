import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionManager, type SessionVault, type SessionRuntime } from '@discordy/core/application/sessionManager';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import type { StoredSession } from '@discordy/core/application/ports/sessionVault';

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
    renewSession: vi.fn(async () => 'renewed' as const),
  };
}

const stored: StoredSession = { accessToken: 'old', refreshToken: 'r0', userId: '1', deviceId: null };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('refresh crash recovery', () => {
  const id = 'ae4b0d8e-06d1-4b72-9401-44f83fc966bf';
  const next = { access_token: 'new-access', refresh_token: 'new-refresh' };
  const make = async (v = vault(stored)) => {
    const rt = runtime();
    const manager = new SessionManager({ vault: v, runtime: rt, identity: async () => null });
    await manager.boot();
    return { manager, rt, v };
  };

  it('does not send a refresh if saving the recovery identity fails', async () => {
    const { manager, rt, v } = await make();
    vi.mocked(v.save).mockRejectedValueOnce(new Error('vault unavailable'));
    const rotate = vi.fn(async () => next);
    await expect(manager.renewTokens(rotate, () => id)).rejects.toThrow('vault unavailable');
    expect(rotate).not.toHaveBeenCalled();
    expect(v.saved).toEqual(stored);
    expect(rt.setTokens).toHaveBeenLastCalledWith({ access: 'old', refresh: 'r0' });
  });

  it('keeps the same recovery identity across a failed response and process restart', async () => {
    const { manager, v } = await make();
    const first = vi.fn(async (_body: { refresh_token: string; request_id: string }) => { throw new Error('response lost'); });
    await expect(manager.renewTokens(first, () => id)).rejects.toThrow('response lost');
    expect(v.saved).toEqual({ ...stored, refreshRequestId: id });
    const restarted = (await make(v)).manager;
    const second = vi.fn(async () => next);
    await restarted.renewTokens(second, () => 'must-not-generate-another-id');
    expect(second).toHaveBeenCalledWith(first.mock.calls[0]![0]);
    expect(v.saved).toEqual({ ...stored, accessToken: 'new-access', refreshToken: 'new-refresh' });
  });

  it('retries the original request if persisting its successor failed', async () => {
    const { manager, rt, v } = await make();
    vi.mocked(v.save).mockImplementationOnce(async (s) => { v.saved = s; }).mockRejectedValueOnce(new Error('disk full'));
    const rotate = vi.fn(async () => next);
    await expect(manager.renewTokens(rotate, () => id)).rejects.toThrow('disk full');
    expect(v.saved).toEqual({ ...stored, refreshRequestId: id });
    expect(rt.setTokens).toHaveBeenLastCalledWith({ access: 'old', refresh: 'r0' });
    await manager.renewTokens(rotate, () => 'must-not-generate-another-id');
    expect(rotate.mock.calls[1]).toEqual(rotate.mock.calls[0]);
    expect(v.saved).not.toHaveProperty('refreshRequestId');
    expect(rt.setTokens).toHaveBeenLastCalledWith({ access: 'new-access', refresh: 'new-refresh' });
  });

  it('keeps the recovery identity when the refresh response has missing credentials', async () => {
    const { manager, rt, v } = await make();
    await expect(manager.renewTokens(async () => ({ access_token: '', refresh_token: '' }), () => id)).rejects.toThrow();
    expect(v.saved).toEqual({ ...stored, refreshRequestId: id });
    expect(rt.setTokens).toHaveBeenLastCalledWith({ access: 'old', refresh: 'r0' });
    const retry = vi.fn(async () => next);
    await manager.renewTokens(retry, () => 'must-not-generate-another-id');
    expect(retry).toHaveBeenCalledWith({ refresh_token: 'r0', request_id: id });
  });

  it('coalesces overlapping renewals and changes memory only after the successor save finishes', async () => {
    const { manager, rt, v } = await make();
    const saving = deferred<void>();
    const saved = deferred<void>();
    vi.mocked(v.save).mockImplementation(async (s) => {
      if (s.refreshToken === next.refresh_token) { saving.resolve(); await saved.promise; }
      v.saved = s;
    });
    const rotate = vi.fn(async () => next);
    const generate = vi.fn(() => id);
    const a = manager.renewTokens(rotate, generate);
    const b = manager.renewTokens(rotate, generate);
    await saving.promise;
    expect(v.saved).toEqual({ ...stored, refreshRequestId: id });
    expect(rt.setTokens).toHaveBeenLastCalledWith({ access: 'old', refresh: 'r0' });
    saved.resolve();
    await expect(Promise.all([a, b])).resolves.toEqual(['new-access', 'new-access']);
    expect(rotate).toHaveBeenCalledTimes(1);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('cannot restore credentials when logout completes during a refresh request', async () => {
    const { manager, rt, v } = await make();
    const started = deferred<void>();
    const response = deferred<typeof next>();
    const pending = manager.renewTokens(async () => { started.resolve(); return response.promise; }, () => id);
    await started.promise;
    await manager.logout();
    response.resolve(next);
    await expect(pending).resolves.toBeNull();
    expect(v.saved).toBeNull();
    expect(rt.setTokens).toHaveBeenLastCalledWith({ access: null, refresh: null });
  });

  it('serializes logout behind a pending vault save and sends no stale request', async () => {
    const { manager, v } = await make();
    const started = deferred<void>();
    const finish = deferred<void>();
    vi.mocked(v.save).mockImplementationOnce(async (s) => { started.resolve(); await finish.promise; v.saved = s; });
    const rotate = vi.fn(async () => next);
    const pending = manager.renewTokens(rotate, () => id);
    await started.promise;
    const expired = manager.sessionExpired();
    finish.resolve();
    await Promise.all([pending, expired]);
    expect(rotate).not.toHaveBeenCalled();
    expect(v.saved).toBeNull();
  });
});

describe('SessionManager gateway rejection', () => {
  beforeEach(() => useSessionStore.getState().reset());
  afterEach(() => vi.useRealTimers());

  it('keeps the login when the gateway rejects an expired access token and the refresh works', async () => {
    const rt = runtime();
    const v = vault(stored);
    const m = new SessionManager({ vault: v, runtime: rt, identity: async () => null });
    await m.boot();

    await m.gatewayClosed(4004);

    expect(rt.renewSession).toHaveBeenCalledTimes(1);
    expect(v.clear).not.toHaveBeenCalled();
    expect(rt.connect).toHaveBeenCalledTimes(2);
  });

  it('signs out when the server refuses the refresh token', async () => {
    const rt = runtime();
    vi.mocked(rt.renewSession).mockResolvedValue('expired');
    const v = vault(stored);
    const m = new SessionManager({ vault: v, runtime: rt, identity: async () => null });
    await m.boot();

    await m.gatewayClosed(4004);

    expect(v.clear).toHaveBeenCalled();
    expect(useSessionStore.getState().status).toBe('signedOut');
  });

  it('keeps the login and tries again when the server cannot be reached', async () => {
    vi.useFakeTimers();
    const rt = runtime();
    vi.mocked(rt.renewSession).mockResolvedValueOnce('unavailable').mockResolvedValue('renewed');
    const v = vault(stored);
    const m = new SessionManager({ vault: v, runtime: rt, identity: async () => null });
    await m.boot();

    await m.gatewayClosed(4004);
    expect(v.clear).not.toHaveBeenCalled();
    expect(rt.connect).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(rt.connect).toHaveBeenCalledTimes(2);
    expect(v.clear).not.toHaveBeenCalled();
  });

  it('signs out when the gateway also rejects a token that was just renewed', async () => {
    const rt = runtime();
    const v = vault(stored);
    const m = new SessionManager({ vault: v, runtime: rt, identity: async () => null });
    await m.boot();

    await m.gatewayClosed(4004);
    await m.gatewayClosed(4004);

    expect(rt.renewSession).toHaveBeenCalledTimes(1);
    expect(v.clear).toHaveBeenCalled();
  });

  it('signs out on the other fatal close codes', async () => {
    const rt = runtime();
    const v = vault(stored);
    const m = new SessionManager({ vault: v, runtime: rt, identity: async () => null });
    await m.boot();

    await m.gatewayClosed(4014);

    expect(rt.renewSession).not.toHaveBeenCalled();
    expect(v.clear).toHaveBeenCalled();
  });
});

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

  it('runs beforeLogout before the server call, and a failing hook does not block the sign-out', async () => {
    const v = vault({ accessToken: 'a', refreshToken: 'r', userId: '1', deviceId: null });
    const rt = runtime();
    const order: string[] = [];
    (rt.api.logout as ReturnType<typeof vi.fn>).mockImplementation(async () => void order.push('server'));
    const beforeLogout = vi.fn(async () => {
      order.push('hook');
      throw new Error('push token removal failed');
    });
    const m = new SessionManager({ vault: v, runtime: rt, identity: async () => null, beforeLogout });
    await m.boot();
    await m.logout();
    expect(order).toEqual(['hook', 'server']);
    expect(useSessionStore.getState().status).toBe('signedOut');
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
