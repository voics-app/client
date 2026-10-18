import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TurnCredentials } from '@renderer/application/privacy/turnCredentials';

const turn = (username: string) => ({ urls: ['turn:t.test:3478'], username, credential: 'c', ttl: 3600 });

describe('TurnCredentials', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('serves no ice servers until credentials arrive', () => {
    expect(new TurnCredentials(vi.fn()).iceServers()).toEqual([]);
  });

  it('serves the latest credentials including a derived STUN entry', () => {
    const creds = new TurnCredentials(vi.fn());
    creds.update(turn('a'));
    expect(creds.iceServers()).toEqual([
      { urls: ['stun:t.test:3478'] },
      { urls: ['turn:t.test:3478'], username: 'a', credential: 'c' },
    ]);
    creds.update(turn('b'));
    expect(creds.iceServers()[1]?.username).toBe('b');
  });

  it('requests a refresh before the ttl elapses and not again once new credentials arrive', () => {
    const refresh = vi.fn();
    const creds = new TurnCredentials(refresh);
    creds.update(turn('a'));
    vi.advanceTimersByTime(2_879_000);
    expect(refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2_000);
    expect(refresh).toHaveBeenCalledTimes(1);
    creds.update(turn('b'));
    vi.advanceTimersByTime(2_000_000);
    expect(refresh).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1_000_000);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('stops refreshing and drops credentials on clear', () => {
    const refresh = vi.fn();
    const creds = new TurnCredentials(refresh);
    creds.update(turn('a'));
    creds.clear();
    vi.advanceTimersByTime(4_000_000);
    expect(refresh).not.toHaveBeenCalled();
    expect(creds.iceServers()).toEqual([]);
  });

  it('ignores a missing turn payload (server without coturn)', () => {
    const creds = new TurnCredentials(vi.fn());
    creds.update(undefined);
    expect(creds.iceServers()).toEqual([]);
  });
});
