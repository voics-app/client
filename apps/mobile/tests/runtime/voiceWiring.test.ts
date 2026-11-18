import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { confirmAgeRestrictedChannel } from '@discordy/core/application/ageRestrictedAccess';
import type { StoredSession } from '@discordy/core/application/ports/sessionVault';
import type { SocketLike } from '@discordy/core/infrastructure/net/socket';
import type { IceServer } from '@discordy/core/domain/turn';
import { createRuntime } from '../../src/runtime/createRuntime';
import type { MobileVoice } from '../../src/voice/mobileVoice';

class FakeSocket implements SocketLike {
  static all: FakeSocket[] = [];
  readyState = 1;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(readonly url: string) {
    FakeSocket.all.push(this);
  }
  send() {}
  close() {
    this.readyState = 3;
  }
  receive(frame: unknown) {
    this.onmessage?.({ data: JSON.stringify(frame) });
  }
}

const user = { id: 'u1', username: 'me', discriminator: '0', avatar: null };
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const stored: StoredSession = { accessToken: 'acc', refreshToken: 'ref', userId: 'u1', deviceId: null };

const runtimes: ReturnType<typeof createRuntime>[] = [];

function setup(createVoice?: Parameters<typeof createRuntime>[0]['createVoice']) {
  const runtime = createRuntime({
    apiUrl: 'https://api.test',
    gatewayUrl: 'wss://gw.test',
    deviceName: 'Voics iOS',
    platform: 'ios',
    version: '1.0.0',
    vault: { load: async () => stored, save: async () => undefined, clear: async () => undefined },
    socketFactory: (url) => new FakeSocket(url),
    fetch: (async () => new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })) as unknown as typeof fetch,
    ...(createVoice ? { createVoice } : {}),
  });
  runtimes.push(runtime);
  return runtime;
}

function fakeVoice() {
  const controller = { onVoiceServerUpdate: jest.fn(), onVoiceState: jest.fn(), leave: jest.fn(async () => undefined), leaveImmediately: jest.fn(async () => undefined) };
  return { controller, voice: { controller, route: {}, dispose: jest.fn() } as unknown as MobileVoice };
}

async function ready(runtime: ReturnType<typeof setup>, turn?: object) {
  await runtime.session.boot();
  const socket = FakeSocket.all.at(-1)!;
  socket.receive({ op: 10, d: { heartbeat_interval: 60_000 }, s: null, t: null });
  await flush();
  socket.receive({ op: 0, s: 1, t: 'READY', d: { session_id: 's1', user, user_settings: {}, guilds: [], private_channels: [], relationships: [], read_state: [], ...(turn ? { turn } : {}) } });
  return socket;
}

describe('runtime voice wiring', () => {
  beforeEach(() => {
    FakeSocket.all = [];
    useSessionStore.getState().reset();
  });

  afterEach(async () => {
    // Closes every gateway socket and clears the turn refresh timer, so nothing keeps Jest alive.
    for (const runtime of runtimes.splice(0)) await runtime.session.logout();
  });

  it('has no voice where the native stack is missing (Expo Go)', () => {
    expect(setup().voice).toBeNull();
    expect(setup(() => null).voice).toBeNull();
  });

  it('routes VOICE_SERVER_UPDATE and our own voice state to the call', async () => {
    const { controller, voice } = fakeVoice();
    const runtime = setup(() => voice);
    expect(runtime.voice).toBe(voice);
    const socket = await ready(runtime);
    useGuildStore.getState().upsertChannel({ id: 'v1', guild_id: 'g1', type: 2, delivery_mode: 'standard' });
    const update = { token: 't', guild_id: 'g1', channel_id: 'v1', endpoint: 'rtc.test', region: 'eu' };
    socket.receive({ op: 0, s: 2, t: 'VOICE_SERVER_UPDATE', d: update });
    expect(controller.onVoiceServerUpdate).toHaveBeenCalledWith(update);
    const state = { guild_id: 'g1', channel_id: null, user_id: 'u1', session_id: 's1', deaf: false, mute: false, self_deaf: false, self_mute: false, self_video: false, suppress: false };
    socket.receive({ op: 0, s: 3, t: 'VOICE_STATE_UPDATE', d: state });
    expect(controller.onVoiceState).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'u1', channel_id: null }));
  });

  it('refuses a server-directed move into restricted voice until this channel is confirmed', async () => {
    const { controller, voice } = fakeVoice();
    const runtime = setup(() => voice);
    const socket = await ready(runtime);
    useGuildStore.getState().upsertChannel({ id: 'v2', guild_id: 'g1', type: 2, nsfw: true, delivery_mode: 'standard' });
    const update = { token: 't', guild_id: 'g1', channel_id: 'v2', endpoint: 'rtc.test', region: 'eu' };
    socket.receive({ op: 0, s: 2, t: 'VOICE_SERVER_UPDATE', d: update });
    expect(controller.onVoiceServerUpdate).not.toHaveBeenCalled();
    expect(controller.leaveImmediately).toHaveBeenCalledTimes(1);
    confirmAgeRestrictedChannel('v2');
    socket.receive({ op: 0, s: 3, t: 'VOICE_SERVER_UPDATE', d: update });
    expect(controller.onVoiceServerUpdate).toHaveBeenCalledWith(update);
  });

  it('gives the voice stack the gateway turn servers from READY', async () => {
    let iceServers: () => IceServer[] = () => [];
    const { voice } = fakeVoice();
    const runtime = setup((deps) => {
      iceServers = deps.iceServers;
      return voice;
    });
    expect(iceServers()).toEqual([]);
    await ready(runtime, { urls: ['turn:t.test:3478'], username: 'name', credential: 'secret', ttl: 3600 });
    expect(iceServers()).toEqual([
      { urls: ['stun:t.test:3478'] },
      { urls: ['turn:t.test:3478'], username: 'name', credential: 'secret' },
    ]);
    await runtime.session.logout();
    expect(iceServers()).toEqual([]);
  });

  it('leaves the call when the session ends', async () => {
    const { controller, voice } = fakeVoice();
    const runtime = setup(() => voice);
    await ready(runtime);
    await runtime.session.logout();
    expect(controller.leave).toHaveBeenCalled();
  });
});
