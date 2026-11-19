import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GatewayClient } from '../../src/infrastructure/gateway/gatewayClient';
import { GatewayOp } from '../../src/contracts';
import { FakeSocket } from './fakeSocket';

const configuredUrl = 'wss://gw.test/gateway?v=1&encoding=json';
const resumeUrl = 'wss://resume.test/gateway?v=1&encoding=json';

function makeClient(overrides: Partial<ConstructorParameters<typeof GatewayClient>[0]> = {}) {
  return new GatewayClient({
    url: 'wss://gw.test',
    getToken: () => 'tok',
    getDeviceId: () => 'dev1',
    properties: { os: 'win32', client: 'discordy-desktop', version: '0.1.0' },
    socketFactory: (url) => new FakeSocket(url),
    random: () => 0.5,
    ...overrides,
  });
}

async function startSession(overrides: Partial<ConstructorParameters<typeof GatewayClient>[0]> = {}) {
  const client = makeClient(overrides);
  client.connect();
  const socket = FakeSocket.latest();
  await receiveHello(socket);
  socket.receive({ op: 0, t: 'READY', s: 7, d: {
    session_id: 'sess', resume_gateway_url: 'wss://resume.test', user: { id: '1' },
  } });
  return { client, socket };
}

async function receiveHello(socket: FakeSocket, interval = 41_250) {
  socket.open();
  socket.receive({ op: GatewayOp.HELLO, d: { heartbeat_interval: interval }, s: null, t: null });
  await Promise.resolve();
}

describe('Gateway connection recovery', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeSocket.reset();
  });
  afterEach(() => vi.useRealTimers());

  it('falls back to the configured gateway when the advertised resume endpoint refuses the connection', async () => {
    let token = 'tok';
    const { client, socket } = await startSession({ getToken: () => token });
    socket.serverClose(1006);
    await vi.advanceTimersByTimeAsync(2000);
    const resume = FakeSocket.latest();
    expect(resume.url).toBe(resumeUrl);
    resume.serverClose(1006);
    await vi.advanceTimersByTimeAsync(4000);
    const fallback = FakeSocket.latest();
    expect(fallback.url).toBe(configuredUrl);
    token = 'refreshed-token';
    await receiveHello(fallback);
    expect(fallback.sent.find((frame) => frame.op === GatewayOp.RESUME)?.d)
      .toEqual({ token: 'refreshed-token', session_id: 'sess', seq: 7 });
    expect(fallback.ops()).not.toContain(GatewayOp.IDENTIFY);
    fallback.receive({ op: 0, t: 'RESUMED', s: 8, d: null });
    expect(client.state).toBe('ready');
    fallback.serverClose(1006);
    await vi.advanceTimersByTimeAsync(2000);
    expect(FakeSocket.latest().url).toBe(configuredUrl);
  });

  it.each(['connecting', 'open without HELLO', 'error without close'])(
    'bounds a resume socket that remains %s before falling back', async (behavior) => {
      const { client } = await startSession();
      client.resumeNow();
      const stalled = FakeSocket.latest();
      expect(stalled.url).toBe(resumeUrl);
      if (behavior === 'open without HELLO') stalled.open();
      if (behavior === 'error without close') stalled.onerror?.();
      await vi.advanceTimersByTimeAsync(9999);
      expect(stalled.closedWith).toBeNull();
      await vi.advanceTimersByTimeAsync(1);
      expect(stalled.closedWith).not.toBeNull();
      expect(client.state).toBe('reconnecting');
      await vi.advanceTimersByTimeAsync(2000);
      expect(FakeSocket.latest().url).toBe(configuredUrl);
      stalled.serverClose(4004);
      stalled.receive({ op: 0, t: 'READY', s: 99, d: { session_id: 'stale' } });
      expect(client.sessionId).toBe('sess');
      expect(client.sequence).toBe(7);
      expect(client.state).toBe('resuming');
    },
  );

  it('recovers when constructing the resume socket is refused synchronously', async () => {
    const attemptedUrls: string[] = [];
    const { socket } = await startSession({ socketFactory: (url) => {
      attemptedUrls.push(url);
      if (url === resumeUrl) throw new Error('connection refused');
      return new FakeSocket(url);
    } });
    socket.serverClose(1006);
    await vi.advanceTimersByTimeAsync(6000);
    expect(attemptedUrls).toEqual([configuredUrl, resumeUrl, configuredUrl]);
    await receiveHello(FakeSocket.latest());
    expect(FakeSocket.latest().ops()).toContain(GatewayOp.RESUME);
  });

  it.each(['initial', 'resume'])('bounds a responsive %s socket that never finishes authentication', async (phase) => {
    const client = phase === 'initial' ? makeClient() : (await startSession()).client;
    if (phase === 'initial') client.connect();
    else client.resumeNow();
    const stalled = FakeSocket.latest();
    await receiveHello(stalled, 1000);
    for (let second = 0; second < 29; second += 1) {
      await vi.advanceTimersByTimeAsync(1000);
      stalled.receive({ op: GatewayOp.HEARTBEAT_ACK, d: null, s: null, t: null });
    }
    await vi.advanceTimersByTimeAsync(999);
    expect(stalled.closedWith).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(stalled.closedWith).not.toBeNull();
    await vi.advanceTimersByTimeAsync(2000);
    const fallback = FakeSocket.latest();
    expect(fallback.url).toBe(configuredUrl);
    await receiveHello(fallback);
    expect(fallback.ops()).toContain(phase === 'initial' ? GatewayOp.IDENTIFY : GatewayOp.RESUME);
  });

  it('does not extend the authentication deadline on a duplicate HELLO', async () => {
    const { client } = await startSession();
    client.resumeNow();
    const stalled = FakeSocket.latest();
    await receiveHello(stalled, 1_000_000);
    await vi.advanceTimersByTimeAsync(20_000);
    await receiveHello(stalled, 1_000_000);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(stalled.closedWith).not.toBeNull();
    expect(stalled.ops().filter((op) => op === GatewayOp.RESUME)).toHaveLength(1);
  });

  it('keeps a healthy resume endpoint and cancels both connection deadlines', async () => {
    const { client } = await startSession();
    client.resumeNow();
    const resumed = FakeSocket.latest();
    await vi.advanceTimersByTimeAsync(9000);
    await receiveHello(resumed, 1000);
    resumed.receive({ op: 0, t: 'RESUMED', s: 8, d: null });
    for (let second = 0; second < 35; second += 1) {
      await vi.advanceTimersByTimeAsync(1000);
      resumed.receive({ op: GatewayOp.HEARTBEAT_ACK, d: null, s: null, t: null });
    }
    expect(client.state).toBe('ready');
    expect(resumed.closedWith).toBeNull();
    expect(FakeSocket.instances).toHaveLength(2);
    resumed.serverClose(1006);
    await vi.advanceTimersByTimeAsync(2000);
    expect(FakeSocket.latest().url).toBe(resumeUrl);
  });

  it.each([4004, 4013, 4014])('stops on fatal code %s from the resume endpoint', async (code) => {
    const { client } = await startSession();
    const fatal = vi.fn();
    client.onFatal(fatal);
    client.resumeNow();
    await receiveHello(FakeSocket.latest());
    FakeSocket.latest().serverClose(code);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(FakeSocket.instances).toHaveLength(2);
    expect(client.state).toBe('closed');
    expect(fatal).toHaveBeenCalledWith(code);
  });

  it.each(['HELLO', 'READY'])('cancels a pending %s deadline on manual disconnect', async (phase) => {
    const { client } = await startSession();
    client.resumeNow();
    if (phase === 'READY') await receiveHello(FakeSocket.latest());
    client.disconnect();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(FakeSocket.instances).toHaveLength(2);
    expect(client.state).toBe('closed');
  });

  it('does not authenticate or reconnect when the token disappears before fallback', async () => {
    let token: string | null = 'tok';
    const { client } = await startSession({ getToken: () => token });
    const fatal = vi.fn();
    client.onFatal(fatal);
    client.resumeNow();
    FakeSocket.latest().serverClose(1006);
    await vi.advanceTimersByTimeAsync(2000);
    const fallback = FakeSocket.latest();
    token = null;
    await receiveHello(fallback);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fallback.sent).toEqual([]);
    expect(FakeSocket.instances).toHaveLength(3);
    expect(client.state).toBe('closed');
    expect(fatal).toHaveBeenCalledWith(4003);
  });

  it('re-identifies after the fallback rejects an expired session and accepts a fresh resume endpoint', async () => {
    const { client } = await startSession();
    client.resumeNow();
    FakeSocket.latest().serverClose(1006);
    await vi.advanceTimersByTimeAsync(2000);
    const fallback = FakeSocket.latest();
    await receiveHello(fallback);
    fallback.receive({ op: GatewayOp.INVALID_SESSION, d: false, s: null, t: null });
    await vi.advanceTimersByTimeAsync(4000);
    const fresh = FakeSocket.latest();
    expect(fresh.url).toBe(configuredUrl);
    await receiveHello(fresh);
    expect(fresh.ops()).toContain(GatewayOp.IDENTIFY);
    expect(fresh.ops()).not.toContain(GatewayOp.RESUME);
    fresh.receive({ op: 0, t: 'READY', s: 1, d: {
      session_id: 'fresh', resume_gateway_url: 'wss://new-resume.test', user: { id: '1' },
    } });
    fresh.serverClose(1006);
    await vi.advanceTimersByTimeAsync(2000);
    expect(FakeSocket.latest().url).toBe('wss://new-resume.test/gateway?v=1&encoding=json');
  });
});
