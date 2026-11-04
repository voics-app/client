import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GatewayOp, type WatchTogetherPayload } from '@discordy/core/contracts/gateway';
import { WatchTogetherService, type PlayerPort, type UserPlayerAction } from '@renderer/application/watch/watchTogetherService';
import { ElementPlayer, type MediaElementLike } from '@renderer/application/watch/elementPlayer';
import { validateWatchUrl } from '@renderer/application/watch/watchUrl';
import { usePrivacyStore } from '@renderer/application/stores/privacyStore';

class FakePlayer implements PlayerPort {
  position = 0;
  playing = false;
  actions: ((a: UserPlayerAction) => void)[] = [];
  load = vi.fn(async (_source: unknown, _localUrl?: string) => undefined);
  play = vi.fn(async () => void (this.playing = true));
  pause = vi.fn(() => void (this.playing = false));
  seek = vi.fn((ms: number) => void (this.position = ms));
  positionMs() {
    return this.position;
  }
  isPlaying() {
    return this.playing;
  }
  onUserAction(l: (a: UserPlayerAction) => void) {
    this.actions.push(l);
    return () => undefined;
  }
}

function setup() {
  let opListener: ((op: number, d: unknown) => void) | null = null;
  const sent: { op: number; d: WatchTogetherPayload }[] = [];
  let now = 1_000_000;
  const service = new WatchTogetherService({
    gateway: {
      send: (op, d) => sent.push({ op, d: d as WatchTogetherPayload }),
      onOp: (l) => ((opListener = l), () => undefined),
    },
    userId: () => 'me',
    now: () => now,
    driftCheckMs: 1000,
  });
  const player = new FakePlayer();
  service.attachPlayer('c1', player);
  return {
    service,
    player,
    sent,
    receive: (d: Partial<WatchTogetherPayload>) =>
      opListener?.(GatewayOp.WATCH_TOGETHER, { channel_id: 'c1', action: 'play', position_ms: 0, at_server_ms: now, user_id: 'u2', ...d }),
    advance: (ms: number) => (now += ms),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  usePrivacyStore.setState({ watch: {}, serverOffsetMs: 0 });
});
afterEach(() => vi.useRealTimers());

describe('validateWatchUrl', () => {
  it('accepts https media files and local references', () => {
    expect(validateWatchUrl('https://cdn.example.com/a/movie.mp4')).toEqual({ ok: true, source: { kind: 'remote', url: 'https://cdn.example.com/a/movie.mp4' } });
    expect(validateWatchUrl('local:film.mkv')).toEqual({ ok: true, source: { kind: 'local', name: 'film.mkv' } });
  });
  it('rejects http, credentials, non-media, and DRM services', () => {
    for (const bad of ['http://x.com/a.mp4', 'https://u:p@x.com/a.mp4', 'https://x.com/page', 'https://www.netflix.com/watch/1.mp4', 'https://youtube.com/watch?v=1', 'javascript:alert(1)', 'local:', 'blob:https://x/1']) {
      expect(validateWatchUrl(bad).ok, bad).toBe(false);
    }
  });
});

describe('WatchTogetherService', () => {
  it('shares a loaded source and tells peers to load it', async () => {
    const { service, sent, player } = setup();
    await service.load('https://cdn.example.com/m.mp4');
    expect(player.load).toHaveBeenCalled();
    expect(sent[0]).toMatchObject({ op: GatewayOp.WATCH_TOGETHER, d: { channel_id: 'c1', action: 'load', url: 'https://cdn.example.com/m.mp4' } });
    expect(service.getStatus().state).toBe('ready');
  });

  it('refuses disallowed sources without sending anything', async () => {
    const { service, sent } = setup();
    await service.load('https://www.netflix.com/title.mp4');
    expect(sent).toHaveLength(0);
    expect(service.getStatus()).toMatchObject({ state: 'error' });
  });

  it('a remote load of a local file waits for the user to pick the same file', async () => {
    const { service, receive, player } = setup();
    receive({ action: 'load', url: 'local:film.mp4' });
    await vi.advanceTimersByTimeAsync(1);
    expect(service.getStatus()).toEqual({ state: 'awaiting_local_file', name: 'film.mp4' });
    await service.provideLocalFile('film.mp4', 'blob:abc');
    expect(player.load).toHaveBeenCalledWith({ kind: 'local', name: 'film.mp4' }, 'blob:abc');
    expect(service.getStatus().state).toBe('ready');
  });

  it('applies a remote play anchor, compensating for elapsed server time', async () => {
    const { service, receive, player, advance } = setup();
    await service.load('https://cdn.example.com/m.mp4');
    advance(2000);
    receive({ action: 'play', position_ms: 10_000, at_server_ms: 1_000_000 });
    await vi.advanceTimersByTimeAsync(1);
    expect(player.seek).toHaveBeenCalledWith(12_000);
    expect(player.play).toHaveBeenCalled();
  });

  it('applies pause at the exact position', async () => {
    const { service, receive, player } = setup();
    await service.load('https://cdn.example.com/m.mp4');
    player.playing = true;
    receive({ action: 'pause', position_ms: 5000 });
    await vi.advanceTimersByTimeAsync(1);
    expect(player.pause).toHaveBeenCalled();
    expect(player.position).toBe(5000);
  });

  it('corrects drift only beyond the tolerance', async () => {
    const { service, receive, player, advance } = setup();
    await service.load('https://cdn.example.com/m.mp4');
    receive({ action: 'play', position_ms: 0, at_server_ms: 1_000_000 });
    await vi.advanceTimersByTimeAsync(1);
    player.seek.mockClear();
    advance(1000);
    player.position = 600; // 400ms behind: within tolerance
    await vi.advanceTimersByTimeAsync(1000);
    expect(player.seek).not.toHaveBeenCalled();
    advance(1000);
    player.position = 700; // 1300ms behind
    await vi.advanceTimersByTimeAsync(1000);
    expect(player.seek).toHaveBeenCalledWith(2000);
  });

  it('user actions on the player are broadcast', async () => {
    const { service, player, sent } = setup();
    await service.load('https://cdn.example.com/m.mp4');
    await vi.advanceTimersByTimeAsync(1);
    sent.length = 0;
    player.actions[0]!({ action: 'seek', positionMs: 42_000 });
    expect(sent[0]?.d).toMatchObject({ action: 'seek', position_ms: 42_000 });
    service.play();
    expect(sent[1]?.d).toMatchObject({ action: 'play' });
  });

  it('estimates the server clock offset from its own echoed message', async () => {
    const { service, receive, advance } = setup();
    await service.load('https://cdn.example.com/m.mp4');
    service.seek(8000);
    advance(100);
    receive({ action: 'seek', position_ms: 8000, user_id: 'me', at_server_ms: 1_000_000 + 50 + 5000 });
    await vi.advanceTimersByTimeAsync(1);
    expect(usePrivacyStore.getState().serverOffsetMs).toBe(5000);
  });

  it('ignores other channels', async () => {
    const { service, receive, player } = setup();
    await service.load('https://cdn.example.com/m.mp4');
    receive({ channel_id: 'other', action: 'pause', position_ms: 1 });
    await vi.advanceTimersByTimeAsync(1);
    expect(player.pause).not.toHaveBeenCalled();
  });
});

class FakeElement implements MediaElementLike {
  currentTime = 0;
  paused = true;
  src = '';
  private handlers = new Map<string, Set<() => void>>();
  async play() {
    this.paused = false;
    this.fire('play');
  }
  pause() {
    this.paused = true;
    this.fire('pause');
  }
  load() {
    queueMicrotask(() => this.fire('loadedmetadata'));
  }
  addEventListener(t: string, l: () => void) {
    if (!this.handlers.has(t)) this.handlers.set(t, new Set());
    this.handlers.get(t)!.add(l);
  }
  removeEventListener(t: string, l: () => void) {
    this.handlers.get(t)?.delete(l);
  }
  fire(t: string) {
    this.handlers.get(t)?.forEach((l) => l());
  }
  userSeek(seconds: number) {
    this.currentTime = seconds;
    this.fire('seeked');
  }
}

describe('ElementPlayer', () => {
  it('reports user actions but swallows its own programmatic events', async () => {
    const el = new FakeElement();
    const player = new ElementPlayer(el);
    const actions: UserPlayerAction[] = [];
    player.onUserAction((a) => actions.push(a));
    await player.play();
    player.seek(5000);
    el.fire('seeked');
    player.pause();
    expect(actions).toEqual([]);
    el.userSeek(9);
    expect(actions).toEqual([{ action: 'seek', positionMs: 9000 }]);
    await el.play();
    expect(actions.at(-1)?.action).toBe('play');
  });

  it('loads remote and local sources, rejecting local ones without a file', async () => {
    vi.useRealTimers();
    const el = new FakeElement();
    const player = new ElementPlayer(el);
    await player.load({ kind: 'remote', url: 'https://x.test/a.mp4' });
    expect(el.src).toBe('https://x.test/a.mp4');
    await player.load({ kind: 'local', name: 'f.mp4' }, 'blob:1');
    expect(el.src).toBe('blob:1');
    await expect(player.load({ kind: 'local', name: 'f.mp4' })).rejects.toThrow();
  });
});
