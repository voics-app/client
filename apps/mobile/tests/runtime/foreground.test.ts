import type { GatewayState } from '@discordy/core/application/ports/gateway';
import { createMemoryStorage, installDeviceStorage } from '@discordy/core/application/ports/deviceStorage';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { GatewayOp } from '@discordy/core/contracts/gateway';
import { shouldResumeOnForeground, STALE_AFTER_MS, watchForeground, type AppStateLike } from '../../src/runtime/foreground';
import { currentMobilePresence, rememberMobileStatus } from '../../src/runtime/mobilePresence';

describe('shouldResumeOnForeground', () => {
  it('never reconnects a gateway that was closed on purpose or never started', () => {
    expect(shouldResumeOnForeground('idle', 10 * STALE_AFTER_MS)).toBe(false);
    expect(shouldResumeOnForeground('closed', 10 * STALE_AFTER_MS)).toBe(false);
  });

  it('leaves a ready connection alone after a short absence and replaces it after a long one', () => {
    expect(shouldResumeOnForeground('ready', STALE_AFTER_MS - 1)).toBe(false);
    expect(shouldResumeOnForeground('ready', STALE_AFTER_MS)).toBe(true);
  });

  it.each<GatewayState>(['connecting', 'identifying', 'resuming', 'reconnecting'])('replaces a %s connection at once', (state) => {
    expect(shouldResumeOnForeground(state, 0)).toBe(true);
  });
});

describe('watchForeground', () => {
  beforeEach(() => {
    useSessionStore.getState().reset();
    installDeviceStorage(createMemoryStorage());
    useSessionStore.getState().setUser({ id: 'u1', username: 'me', global_name: null, avatar: null });
  });

  function setup(state: GatewayState) {
    let listener: (next: string) => void = () => undefined;
    const removed = jest.fn();
    const appState: AppStateLike = {
      addEventListener: (_type, fn) => {
        listener = fn;
        return { remove: removed };
      },
    };
    let clock = 0;
    const gateway = { state, resumeNow: jest.fn(), send: jest.fn() };
    const stop = watchForeground(appState, gateway, () => clock);
    return { gateway, stop, removed, emit: (next: string) => listener(next), advance: (ms: number) => (clock += ms) };
  }

  it('publishes idle before the default mobile session is suspended and online when it returns', () => {
    const t = setup('ready');
    t.emit('background');
    expect(t.gateway.send).toHaveBeenLastCalledWith(GatewayOp.PRESENCE_UPDATE, expect.objectContaining({ status: 'idle', afk: true }));
    t.emit('active');
    expect(t.gateway.send).toHaveBeenLastCalledWith(GatewayOp.PRESENCE_UPDATE, expect.objectContaining({ status: 'online', afk: false }));
  });

  it.each(['online', 'idle', 'dnd', 'invisible'] as const)('preserves the explicitly selected %s status while backgrounded', (status) => {
    useSessionStore.getState().setSettings({ status });
    rememberMobileStatus(status);
    const t = setup('ready');
    t.emit('background');
    expect(t.gateway.send).toHaveBeenLastCalledWith(GatewayOp.PRESENCE_UPDATE, expect.objectContaining({ status, afk: false }));
  });

  it('keeps explicit Online across a watcher restart and scopes it to the signed-in account', () => {
    rememberMobileStatus('online');
    const first = setup('ready');
    first.stop();
    const second = setup('ready');
    second.emit('background');
    expect(currentMobilePresence().status).toBe('online');
    useSessionStore.getState().setUser({ id: 'u2', username: 'other', global_name: null, avatar: null });
    expect(currentMobilePresence().status).toBe('idle');
    useSessionStore.getState().setUser({ id: 'u1', username: 'me', global_name: null, avatar: null });
    expect(currentMobilePresence().status).toBe('online');
    second.stop();
  });

  it('keeps an inactive interruption online and ignores duplicate background events', () => {
    const t = setup('ready');
    t.emit('inactive');
    expect(t.gateway.send).not.toHaveBeenCalled();
    t.emit('background');
    t.emit('background');
    expect(t.gateway.send).toHaveBeenCalledTimes(1);
  });

  it('uses the foreground status after the socket has resumed, not before authentication', () => {
    let ready: (event: string, data: unknown) => void = () => undefined;
    let listener: (state: string) => void = () => undefined;
    const gateway = {
      state: 'ready' as GatewayState,
      send: jest.fn(),
      resumeNow: jest.fn(() => { gateway.state = 'resuming'; }),
      onDispatch: (fn: (event: string, data: unknown) => void) => { ready = fn; return jest.fn(); },
    };
    let now = 0;
    const stop = watchForeground({ addEventListener: (_type, fn) => { listener = fn; return { remove: jest.fn() }; } }, gateway, () => now);
    listener('background');
    gateway.send.mockClear();
    now = STALE_AFTER_MS;
    listener('active');
    expect(gateway.send).not.toHaveBeenCalled();
    gateway.state = 'ready';
    ready('RESUMED', {});
    expect(gateway.send).toHaveBeenCalledWith(3, expect.objectContaining({ status: 'online', background: false }));
    stop();
  });

  it('does not publish presence after logout', () => {
    const t = setup('ready');
    t.emit('background');
    t.gateway.state = 'closed';
    useSessionStore.getState().reset();
    t.gateway.send.mockClear();
    t.emit('active');
    expect(t.gateway.send).not.toHaveBeenCalled();
  });

  it('resumes after a long stay in the background', () => {
    const t = setup('ready');
    t.emit('background');
    t.advance(STALE_AFTER_MS + 1);
    t.emit('active');
    expect(t.gateway.resumeNow).toHaveBeenCalledTimes(1);
  });

  it('does not resume for a brief inactive moment such as the control centre', () => {
    const t = setup('ready');
    t.emit('inactive');
    t.advance(2000);
    t.emit('active');
    expect(t.gateway.resumeNow).not.toHaveBeenCalled();
  });

  it('resumes a connection that was mid-reconnect even after a short absence', () => {
    const t = setup('reconnecting');
    t.emit('background');
    t.advance(1000);
    t.emit('active');
    expect(t.gateway.resumeNow).toHaveBeenCalledTimes(1);
  });

  it('ignores active events that were not preceded by leaving, and stops on request', () => {
    const t = setup('reconnecting');
    t.emit('active');
    expect(t.gateway.resumeNow).not.toHaveBeenCalled();
    t.stop();
    expect(t.removed).toHaveBeenCalled();
  });
});
