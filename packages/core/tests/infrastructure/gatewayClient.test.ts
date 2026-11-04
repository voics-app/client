import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GatewayClient } from '../../src/infrastructure/gateway/gatewayClient';
import { GatewayOp } from '../../src/contracts';
import { FakeSocket } from './fakeSocket';

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

function hello(socket: FakeSocket, interval = 41250) {
  socket.open();
  socket.receive({ op: GatewayOp.HELLO, d: { heartbeat_interval: interval }, s: null, t: null });
}

function ready(socket: FakeSocket, seq = 1) {
  socket.receive({ op: 0, t: 'READY', s: seq, d: { session_id: 'sess', resume_gateway_url: 'wss://resume.test', user: { id: '1' } } });
}

describe('GatewayClient', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeSocket.reset();
  });
  afterEach(() => vi.useRealTimers());

  it('connects with the P7 query string and identifies after HELLO', async () => {
    const client = makeClient();
    client.connect();
    const socket = FakeSocket.latest();
    expect(socket.url).toBe('wss://gw.test/gateway?v=1&encoding=json');
    hello(socket);
    await vi.runOnlyPendingTimersAsync();
    const identify = socket.sent.find((f) => f.op === GatewayOp.IDENTIFY);
    expect(identify?.d).toMatchObject({ token: 'tok', device_id: 'dev1', properties: { client: 'discordy-desktop' } });
    expect((identify?.d as { intents: number }).intents).toBeGreaterThan(0);
  });

  it('emits dispatches and tracks the sequence number', async () => {
    const client = makeClient();
    const events: string[] = [];
    client.onDispatch((t) => events.push(t));
    client.connect();
    const socket = FakeSocket.latest();
    hello(socket);
    await Promise.resolve();
    ready(socket, 1);
    socket.receive({ op: 0, t: 'MESSAGE_CREATE', s: 2, d: { id: 'm' } });
    expect(events).toEqual(['READY', 'MESSAGE_CREATE']);
    expect(client.sequence).toBe(2);
    expect(client.state).toBe('ready');
  });

  it('renewSession drops the session and re-identifies so READY carries fresh TURN credentials', async () => {
    const client = makeClient();
    client.connect();
    const first = FakeSocket.latest();
    hello(first);
    await Promise.resolve();
    ready(first, 1);
    client.renewSession();
    expect(client.sessionId).toBeNull();
    vi.advanceTimersByTime(60_000);
    const second = FakeSocket.latest();
    expect(second).not.toBe(first);
    hello(second);
    await Promise.resolve();
    expect(second.sent.some((f) => f.op === GatewayOp.IDENTIFY)).toBe(true);
    expect(second.sent.some((f) => f.op === GatewayOp.RESUME)).toBe(false);
  });

  it('resumeNow replaces the socket immediately and resumes with the last sequence', async () => {
    const client = makeClient();
    client.connect();
    const first = FakeSocket.latest();
    hello(first);
    await Promise.resolve();
    ready(first, 7);
    client.resumeNow();
    const second = FakeSocket.latest();
    expect(second).not.toBe(first);
    expect(first.closedWith).not.toBeNull();
    expect(client.state).toBe('resuming');
    expect(second.url).toBe('wss://resume.test/gateway?v=1&encoding=json');
    hello(second);
    await Promise.resolve();
    expect(second.sent.find((f) => f.op === GatewayOp.RESUME)?.d).toMatchObject({ session_id: 'sess', seq: 7 });
  });

  it('resumeNow does nothing before connecting or after a manual disconnect', () => {
    const client = makeClient();
    client.resumeNow();
    expect(FakeSocket.instances).toHaveLength(0);
    client.connect();
    client.disconnect();
    const count = FakeSocket.instances.length;
    client.resumeNow();
    expect(FakeSocket.instances).toHaveLength(count);
  });

  it('heartbeats with the last sequence and detects zombie connections', async () => {
    const client = makeClient();
    client.connect();
    const socket = FakeSocket.latest();
    hello(socket, 1000);
    await Promise.resolve();
    ready(socket, 5);
    vi.advanceTimersByTime(500); // jitter = interval * random(0.5)
    const hb = socket.sent.filter((f) => f.op === GatewayOp.HEARTBEAT);
    expect(hb).toHaveLength(1);
    expect(hb[0]!.d).toBe(5);
    // no ACK before the next beat → zombie → close and reconnect
    vi.advanceTimersByTime(1000);
    expect(socket.closedWith).not.toBeNull();
    expect(client.state).toBe('reconnecting');
  });

  it('keeps beating when ACKs arrive', async () => {
    const client = makeClient();
    client.connect();
    const socket = FakeSocket.latest();
    hello(socket, 1000);
    await Promise.resolve();
    vi.advanceTimersByTime(500);
    socket.receive({ op: GatewayOp.HEARTBEAT_ACK, d: null, s: null, t: null });
    vi.advanceTimersByTime(1000);
    socket.receive({ op: GatewayOp.HEARTBEAT_ACK, d: null, s: null, t: null });
    vi.advanceTimersByTime(1000);
    expect(socket.sent.filter((f) => f.op === GatewayOp.HEARTBEAT)).toHaveLength(3);
    expect(socket.closedWith).toBeNull();
  });

  it('answers a server heartbeat request immediately', async () => {
    const client = makeClient();
    client.connect();
    const socket = FakeSocket.latest();
    hello(socket);
    await Promise.resolve();
    socket.receive({ op: GatewayOp.HEARTBEAT, d: null, s: null, t: null });
    expect(socket.ops()).toContain(GatewayOp.HEARTBEAT);
  });

  it('resumes on the resume URL after an unexpected close', async () => {
    const client = makeClient();
    client.connect();
    const first = FakeSocket.latest();
    hello(first);
    await Promise.resolve();
    ready(first, 7);
    first.serverClose(1006);
    await vi.advanceTimersByTimeAsync(2000);
    const second = FakeSocket.latest();
    expect(second).not.toBe(first);
    expect(second.url).toBe('wss://resume.test/gateway?v=1&encoding=json');
    hello(second);
    await Promise.resolve();
    expect(second.sent.find((f) => f.op === GatewayOp.RESUME)?.d).toEqual({ token: 'tok', session_id: 'sess', seq: 7 });
  });

  it('does not double the /gateway path when the resume URL already includes it', async () => {
    const client = makeClient();
    client.connect();
    const first = FakeSocket.latest();
    hello(first);
    await Promise.resolve();
    first.receive({ op: 0, t: 'READY', s: 1, d: { session_id: 'sess', resume_gateway_url: 'ws://localhost:18000/gateway', user: { id: '1' } } });
    first.serverClose(1006);
    await vi.advanceTimersByTimeAsync(2000);
    expect(FakeSocket.latest().url).toBe('ws://localhost:18000/gateway?v=1&encoding=json');
  });

  it('reconnects and resumes when told to RECONNECT (op 7)', async () => {
    const client = makeClient();
    client.connect();
    const first = FakeSocket.latest();
    hello(first);
    await Promise.resolve();
    ready(first, 3);
    first.receive({ op: GatewayOp.RECONNECT, d: null, s: null, t: null });
    expect(first.closedWith).not.toBeNull();
    await vi.advanceTimersByTimeAsync(2000);
    hello(FakeSocket.latest());
    await Promise.resolve();
    expect(FakeSocket.latest().ops()).toContain(GatewayOp.RESUME);
  });

  it('re-identifies after a non-resumable INVALID_SESSION', async () => {
    const client = makeClient();
    client.connect();
    const first = FakeSocket.latest();
    hello(first);
    await Promise.resolve();
    ready(first, 3);
    first.receive({ op: GatewayOp.INVALID_SESSION, d: false, s: null, t: null });
    await vi.advanceTimersByTimeAsync(6000);
    const next = FakeSocket.latest();
    expect(next.url).toBe('wss://gw.test/gateway?v=1&encoding=json');
    hello(next);
    await Promise.resolve();
    expect(next.ops()).toContain(GatewayOp.IDENTIFY);
    expect(next.ops()).not.toContain(GatewayOp.RESUME);
  });

  it('stops on fatal close codes (4004 authentication failed)', async () => {
    const client = makeClient();
    const fatal = vi.fn();
    client.onFatal(fatal);
    client.connect();
    const socket = FakeSocket.latest();
    hello(socket);
    await Promise.resolve();
    socket.serverClose(4004);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(FakeSocket.instances).toHaveLength(1);
    expect(fatal).toHaveBeenCalledWith(4004);
    expect(client.state).toBe('closed');
  });

  it('drops the session on 4009 and identifies fresh', async () => {
    const client = makeClient();
    client.connect();
    const first = FakeSocket.latest();
    hello(first);
    await Promise.resolve();
    ready(first, 3);
    first.serverClose(4009);
    await vi.advanceTimersByTimeAsync(2000);
    hello(FakeSocket.latest());
    await Promise.resolve();
    expect(FakeSocket.latest().ops()).toContain(GatewayOp.IDENTIFY);
  });

  it('rate-limits sends to stay under 120 per 60s', async () => {
    const client = makeClient();
    client.connect();
    const socket = FakeSocket.latest();
    hello(socket, 1_000_000);
    await Promise.resolve();
    ready(socket, 1);
    for (let i = 0; i < 130; i += 1) client.send(GatewayOp.PRESENCE_UPDATE, { status: 'online', activities: [], afk: false });
    const presence = () => socket.sent.filter((f) => f.op === GatewayOp.PRESENCE_UPDATE).length;
    expect(presence()).toBeLessThanOrEqual(115);
    await vi.advanceTimersByTimeAsync(61_000);
    expect(presence()).toBe(130);
  });

  it('does not reconnect after an explicit disconnect', async () => {
    const client = makeClient();
    client.connect();
    const socket = FakeSocket.latest();
    hello(socket);
    await Promise.resolve();
    client.disconnect();
    socket.serverClose(1000);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(FakeSocket.instances).toHaveLength(1);
    expect(client.state).toBe('closed');
  });
});
