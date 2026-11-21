import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import type { StoredSession } from '@discordy/core/application/ports/sessionVault';
import type { SocketLike } from '@discordy/core/infrastructure/net/socket';
import { messageCache } from '../../src/offline/messageCache';
import { createRuntime } from '../../src/runtime/createRuntime';
import { STALE_AFTER_MS, watchForeground } from '../../src/runtime/foreground';
import { rememberMobileStatus } from '../../src/runtime/mobilePresence';
import { createMemoryStorage, installDeviceStorage } from '@discordy/core/application/ports/deviceStorage';

class FakeSocket implements SocketLike {
  static all: FakeSocket[] = [];
  readyState = 1;
  sent: { op: number; d: Record<string, unknown> }[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(readonly url: string) {
    FakeSocket.all.push(this);
  }
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.readyState = 3;
  }
  receive(frame: unknown) {
    this.onmessage?.({ data: JSON.stringify(frame) });
  }
}

const user = { id: 'u1', username: 'me', discriminator: '0', avatar: null };
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const cleanup: (() => void)[] = [];

function memoryVault(initial: StoredSession | null = null) {
  let stored = initial;
  return {
    get: () => stored,
    vault: {
      load: async () => stored,
      save: async (s: StoredSession) => void (stored = s),
      clear: async () => void (stored = null),
    },
  };
}

function setup(initial: StoredSession | null = null) {
  const { vault, get } = memoryVault(initial);
  const fetchMock = jest.fn(async (_url: string, _init?: RequestInit) =>
    new Response(JSON.stringify({ access_token: 'acc', refresh_token: 'ref', user }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
  );
  const runtime = createRuntime({
    apiUrl: 'https://api.test',
    gatewayUrl: 'wss://gw.test',
    deviceName: 'Voics iOS',
    platform: 'ios',
    version: '1.2.3',
    vault,
    socketFactory: (url) => new FakeSocket(url),
    fetch: fetchMock as unknown as typeof fetch,
  });
  cleanup.push(() => runtime.gateway.disconnect());
  return { runtime, get, fetchMock };
}

async function helloAndExpectIdentify(socket: FakeSocket) {
  socket.receive({ op: 10, d: { heartbeat_interval: 60_000 }, s: null, t: null });
  await flush();
  return socket.sent.find((f) => f.op === 2);
}

describe('mobile runtime', () => {
  beforeEach(() => {
    FakeSocket.all = [];
    useSessionStore.getState().reset();
    useGuildStore.getState().reset();
    installDeviceStorage(createMemoryStorage());
  });
  afterEach(() => { cleanup.splice(0).reverse().forEach((stop) => stop()); });

  it('recovers a refresh response lost before restart using the request id already saved in the vault', async () => {
    const { vault, get } = memoryVault({ accessToken: 'old-access', refreshToken: 'old-refresh', userId: 'u1', deviceId: null });
    const requests: { refresh_token: string; request_id?: string }[] = [];
    const fetchMock = jest.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      requests.push(body);
      expect(get()).toMatchObject({ refreshToken: 'old-refresh', refreshRequestId: body.request_id });
      if (requests.length === 1) throw new TypeError('connection closed after server commit');
      return new Response(JSON.stringify({ access_token: 'new-access', refresh_token: 'new-refresh' }), { status: 200 });
    });
    const make = () => {
      const rt = createRuntime({ apiUrl: 'https://api.test', gatewayUrl: 'wss://gw.test', deviceName: 'Voics iOS', platform: 'ios', version: '1', vault, socketFactory: (url) => new FakeSocket(url), fetch: fetchMock as unknown as typeof fetch });
      cleanup.push(() => rt.gateway.disconnect());
      return rt;
    };
    const beforeCrash = make();
    await beforeCrash.session.boot();
    expect(await beforeCrash.http.renewSession()).toBe('unavailable');
    expect(requests[0]?.request_id).toMatch(/^[0-9a-f-]{36}$/);
    beforeCrash.gateway.disconnect();
    const restarted = make();
    await restarted.session.boot();
    expect(await restarted.http.renewSession()).toBe('renewed');
    expect(requests[1]).toEqual(requests[0]);
    expect(get()).toEqual({ accessToken: 'new-access', refreshToken: 'new-refresh', userId: 'u1', deviceId: null });
  });

  it('publishes the background lifecycle, restores explicit Online after resume, and clears presence on logout', async () => {
    const { runtime } = setup();
    let now = 0;
    let emit: (state: string) => void = () => undefined;
    cleanup.push(watchForeground({ addEventListener: (_type, listener) => { emit = listener; return { remove: jest.fn() }; } }, runtime.gateway, () => now));
    await runtime.session.login({ email: 'me@example.test', password: 'pw' });
    const first = FakeSocket.all[0]!;
    expect((await helloAndExpectIdentify(first))?.d.presence).toMatchObject({ status: 'invisible' });
    first.receive({ op: 0, s: 1, t: 'READY', d: { session_id: 's1', user, user_settings: { status: 'online' }, guilds: [], private_channels: [] } });
    emit('background');
    expect(first.sent.at(-1)).toMatchObject({ op: 3, d: { status: 'idle', afk: true, background: true } });
    emit('active');
    rememberMobileStatus('online');
    emit('background');
    expect(first.sent.at(-1)).toMatchObject({ op: 3, d: { status: 'online', background: true } });
    now = STALE_AFTER_MS;
    emit('active');
    const second = FakeSocket.all[1]!;
    second.receive({ op: 10, d: { heartbeat_interval: 60_000 } });
    await flush();
    expect(second.sent.some((f) => f.op === 3)).toBe(false);
    second.receive({ op: 0, s: 2, t: 'RESUMED', d: {} });
    expect(second.sent.at(-1)).toMatchObject({ op: 3, d: { status: 'online', background: false } });
    await runtime.session.logout();
    expect(second.sent.at(-1)).toMatchObject({ op: 3, d: { status: 'invisible', background: false } });
    const sent = second.sent.length;
    emit('background');
    emit('active');
    expect(second.sent).toHaveLength(sent);
  });

  it.each(['invisible', 'dnd'])('never publishes default Online before READY hydrates saved %s', async (status) => {
    const { runtime } = setup({ accessToken: 'acc', refreshToken: 'ref', userId: 'u1', deviceId: null });
    cleanup.push(watchForeground({ currentState: 'background', addEventListener: () => ({ remove: jest.fn() }) }, runtime.gateway));
    await runtime.session.boot();
    const socket = FakeSocket.all[0]!;
    expect((await helloAndExpectIdentify(socket))?.d.presence).toMatchObject({ status: 'invisible' });
    socket.receive({ op: 0, s: 1, t: 'READY', d: { session_id: 's1', user, user_settings: { status }, guilds: [], private_channels: [] } });
    expect(socket.sent.filter((f) => f.op === 3).map((f) => f.d.status)).toEqual([status]);
  });

  it('signs in, stores the session, identifies as the mobile client and fills the stores from READY', async () => {
    const { runtime, get, fetchMock } = setup();
    await runtime.session.login({ email: 'me@example.test', password: 'pw' });

    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.test/api/v1/auth/login');
    expect(get()).toEqual({ accessToken: 'acc', refreshToken: 'ref', userId: 'u1', deviceId: null });
    expect(useSessionStore.getState().status).toBe('connecting');

    const socket = FakeSocket.all[0]!;
    expect(socket.url).toBe('wss://gw.test/gateway?v=1&encoding=json');
    const identify = await helloAndExpectIdentify(socket);
    expect(identify?.d).toMatchObject({ token: 'acc', properties: { os: 'ios', client: 'discordy-mobile', version: '1.2.3' } });

    const guild = { id: 'g1', name: 'Home', icon: null, owner_id: 'u1', roles: [], emojis: [], channels: [], members: [] };
    socket.receive({
      op: 0,
      s: 1,
      t: 'READY',
      d: { session_id: 's1', user, user_settings: {}, guilds: [guild], private_channels: [], relationships: [], read_state: [] },
    });
    expect(useSessionStore.getState().status).toBe('ready');
    expect(useGuildStore.getState().order).toEqual(['g1']);
    expect(useSessionStore.getState().gateway).toBe('ready');
  });

  it('boots from a stored session, connects, and resumes with the session id after a resume request', async () => {
    const { runtime } = setup({ accessToken: 'acc', refreshToken: 'ref', userId: 'u1', deviceId: null });
    await runtime.session.boot();
    const first = FakeSocket.all[0]!;
    await helloAndExpectIdentify(first);
    first.receive({ op: 0, s: 5, t: 'READY', d: { session_id: 's1', resume_gateway_url: 'wss://resume.test', user, user_settings: {}, guilds: [], private_channels: [] } });

    runtime.gateway.resumeNow();
    const second = FakeSocket.all[1]!;
    expect(second.url).toBe('wss://resume.test/gateway?v=1&encoding=json');
    second.receive({ op: 10, d: { heartbeat_interval: 60_000 }, s: null, t: null });
    await flush();
    expect(second.sent.find((f) => f.op === 6)?.d).toEqual({ token: 'acc', session_id: 's1', seq: 5 });
    runtime.session.logout().catch(() => undefined);
  });

  it('reads as signed out when no session is stored', async () => {
    const { runtime } = setup();
    await runtime.session.boot();
    expect(useSessionStore.getState().status).toBe('signedOut');
    expect(FakeSocket.all).toHaveLength(0);
  });

  it('signs out: clears the vault, closes the gateway and empties the stores', async () => {
    const { runtime, get } = setup();
    await runtime.session.login({ email: 'me@example.test', password: 'pw' });
    await runtime.session.logout();
    expect(get()).toBeNull();
    expect(runtime.gateway.state).toBe('closed');
    expect(useSessionStore.getState().status).toBe('signedOut');
    expect(useSessionStore.getState().user).toBeNull();
  });

  it('empties the offline message cache when the session ends', async () => {
    const { runtime } = setup();
    await runtime.session.login({ email: 'me@example.test', password: 'pw' });
    messageCache.save('c1', [{ id: '1', channel_id: 'c1', content: 'private-ish', author: { id: 'u2' }, attachments: [], timestamp: '', type: 0 } as never]);
    expect(messageCache.load('c1')).toHaveLength(1);
    await runtime.session.logout();
    expect(messageCache.load('c1')).toEqual([]);
  });

  it('offers the shared interaction service: a pressed component reaches POST /interactions', async () => {
    const { runtime, fetchMock } = setup();
    await runtime.session.login({ email: 'me@example.test', password: 'pw' });
    fetchMock.mockImplementationOnce(async () => new Response(JSON.stringify({ id: 'i1' }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    await runtime.interactions.pressComponent({ id: 'm1', channel_id: 'c1', guild_id: 'g1', application_id: 'app1' } as never, { type: 2, custom_id: 'ok' });
    const call = fetchMock.mock.calls.at(-1)!;
    expect(call[0]).toBe('https://api.test/api/v1/interactions');
    expect(JSON.parse(String(call[1]?.body))).toMatchObject({ type: 3, application_id: 'app1', channel_id: 'c1', message_id: 'm1', data: { custom_id: 'ok', component_type: 2 } });
  });
});
