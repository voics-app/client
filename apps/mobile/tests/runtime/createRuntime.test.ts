import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import type { StoredSession } from '@discordy/core/application/ports/sessionVault';
import type { SocketLike } from '@discordy/core/infrastructure/net/socket';
import { messageCache } from '../../src/offline/messageCache';
import { createRuntime } from '../../src/runtime/createRuntime';

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
});
