/** Minimal in-process Discordy backend (REST + gateway) for Playwright end-to-end runs. Protocol shapes follow P7/P9. */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocketServer, type WebSocket } from 'ws';

const EPOCH = 1767225600000;
let sequence = 0n;
const snowflake = (): string => String(((BigInt(Date.now() - EPOCH) << 22n) | (sequence++ % 4096n)));

const USER = { id: snowflake(), username: 'ada', global_name: 'Ada Lovelace', avatar: null, email: 'ada@example.test' };

interface Guild {
  id: string;
  name: string;
  channels: { id: string; name: string; type: number; guild_id: string; position: number; delivery_mode: string; last_message_id: string | null; topic: string | null }[];
}

export interface FakeBackend {
  apiUrl: string;
  gatewayUrl: string;
  messages: Map<string, unknown[]>;
  close(): Promise<void>;
}

function guildPayload(g: Guild) {
  return {
    id: g.id,
    name: g.name,
    icon: null,
    owner_id: USER.id,
    roles: [{ id: g.id, name: '@everyone', color: 0, hoist: false, position: 0, permissions: '1071698660929', managed: false, mentionable: false }],
    emojis: [],
    channels: g.channels,
    members: [{ user: USER, roles: [], joined_at: new Date().toISOString(), deaf: false, mute: false }],
    voice_states: [],
    presences: [],
    member_count: 1,
  };
}

export async function startFakeBackend(): Promise<FakeBackend> {
  const guilds: Guild[] = [];
  const messages = new Map<string, unknown[]>();
  const sockets = new Set<WebSocket>();
  let seq = 0;

  const addGuild = (name: string): Guild => {
    const id = snowflake();
    const guild: Guild = {
      id,
      name,
      channels: [
        { id: snowflake(), name: 'general', type: 0, guild_id: id, position: 0, delivery_mode: 'standard', last_message_id: null, topic: 'Say hello' },
        { id: snowflake(), name: 'Lounge', type: 2, guild_id: id, position: 1, delivery_mode: 'standard', last_message_id: null, topic: null },
      ],
    };
    guilds.push(guild);
    return guild;
  };
  addGuild('Nightglass HQ');

  const dispatch = (t: string, d: unknown) => {
    seq += 1;
    for (const ws of sockets) ws.send(JSON.stringify({ op: 0, t, s: seq, d }));
  };

  const json = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(body === null ? '' : JSON.stringify(body));
  };
  const readBody = (req: IncomingMessage): Promise<Record<string, unknown>> =>
    new Promise((resolve) => {
      let data = '';
      req.on('data', (c) => (data += String(c)));
      req.on('end', () => {
        try {
          resolve(data ? (JSON.parse(data) as Record<string, unknown>) : {});
        } catch {
          resolve({});
        }
      });
    });

  const server: Server = createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    if (req.method === 'OPTIONS') return json(res, 204, null);
    const url = new URL(req.url ?? '/', 'http://x');
    const path = url.pathname.replace(/^\/api\/v1/, '');
    const body = req.method === 'GET' ? {} : await readBody(req);

    if (path === '/auth/login' || path === '/auth/register') return json(res, 200, { access_token: 'access-1', refresh_token: 'refresh-1', user: USER });
    if (path === '/auth/refresh') return json(res, 200, { access_token: 'access-2', refresh_token: 'refresh-2' });
    if (path === '/auth/logout') return json(res, 204, null);
    if (path === '/devices') return json(res, 200, { device_id: snowflake() });
    if (/^\/devices\/\d+\/key-packages$/.test(path)) return json(res, 204, null);
    if (/^\/users\/\d+\/devices$/.test(path)) return json(res, 200, []);
    if (path === '/users/@me') return json(res, 200, USER);
    if (path === '/users/@me/settings') return json(res, 200, { default_delivery_mode: 'standard', status: 'online' });
    if (path === '/voice/regions') return json(res, 200, [{ id: 'eu-west', name: 'Europe West', optimal: true }]);
    if (path === '/guilds' && req.method === 'POST') {
      const guild = addGuild(String(body.name ?? 'New server'));
      const payload = guildPayload(guild);
      dispatch('GUILD_CREATE', payload);
      return json(res, 201, payload);
    }
    const history = /^\/channels\/(\d+)\/messages$/.exec(path);
    if (history) {
      const id = history[1]!;
      if (req.method === 'GET') return json(res, 200, [...(messages.get(id) ?? [])].reverse());
      const message = {
        id: snowflake(),
        channel_id: id,
        guild_id: guilds.find((g) => g.channels.some((c) => c.id === id))?.id ?? null,
        author: USER,
        content: String(body.content ?? ''),
        timestamp: new Date().toISOString(),
        edited_timestamp: null,
        mention_everyone: false,
        mentions: [],
        mention_roles: [],
        attachments: [],
        embeds: [],
        pinned: false,
        type: 0,
        nonce: body.nonce ?? null,
      };
      messages.set(id, [...(messages.get(id) ?? []), message]);
      dispatch('MESSAGE_CREATE', message);
      return json(res, 200, message);
    }
    if (/\/ack$/.test(path) || /\/typing$/.test(path)) return json(res, 204, null);
    return json(res, 404, { code: 0, message: `Unhandled ${req.method} ${path}` });
  });

  const wss = new WebSocketServer({ server, path: '/gateway' });
  wss.on('connection', (ws) => {
    sockets.add(ws);
    ws.on('close', () => sockets.delete(ws));
    ws.send(JSON.stringify({ op: 10, d: { heartbeat_interval: 30000 }, s: null, t: null }));
    ws.on('message', (raw) => {
      const frame = JSON.parse(String(raw)) as { op: number };
      if (frame.op === 1) ws.send(JSON.stringify({ op: 11, d: null, s: null, t: null }));
      if (frame.op === 2) {
        seq += 1;
        ws.send(
          JSON.stringify({
            op: 0,
            t: 'READY',
            s: seq,
            d: {
              v: 1,
              user: USER,
              session_id: 'session-e2e',
              guilds: guilds.map(guildPayload),
              private_channels: [],
              relationships: [],
              user_settings: { default_delivery_mode: 'standard', status: 'online' },
              read_state: [],
              presences: [],
            },
          }),
        );
      }
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    apiUrl: `http://127.0.0.1:${port}`,
    gatewayUrl: `ws://127.0.0.1:${port}`,
    messages,
    close: () =>
      new Promise<void>((resolve) => {
        for (const ws of sockets) ws.terminate();
        wss.close();
        server.close(() => resolve());
      }),
  };
}
