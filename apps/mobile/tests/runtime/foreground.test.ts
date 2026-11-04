import type { GatewayState } from '@discordy/core/application/ports/gateway';
import { shouldResumeOnForeground, STALE_AFTER_MS, watchForeground, type AppStateLike } from '../../src/runtime/foreground';

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
    const gateway = { state, resumeNow: jest.fn() };
    const stop = watchForeground(appState, gateway, () => clock);
    return { gateway, stop, removed, emit: (next: string) => listener(next), advance: (ms: number) => (clock += ms) };
  }

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
