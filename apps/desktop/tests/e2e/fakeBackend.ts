/** Minimal in-process Voics backend (REST + gateway) for Playwright end-to-end runs. Protocol shapes follow P7/P9. */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocketServer, type WebSocket } from 'ws';

const EPOCH = 1767225600000;
let sequence = 0n;
const snowflake = (): string => String(((BigInt(Date.now() - EPOCH) << 22n) | (sequence++ % 4096n)));

const BOT = { id: snowflake(), username: 'dicebot', global_name: 'Dice Bot', avatar: null, bot: true };
const APP_ID = snowflake();
const COMMANDS = [
  {
    id: snowflake(),
    application_id: APP_ID,
    name: 'roll',
    description: 'Roll a die',
    options: [
      { type: 4, name: 'sides', description: 'Number of sides', required: true, min_value: 2, max_value: 100 },
      { type: 3, name: 'mode', description: 'How to roll', choices: [{ name: 'Sum', value: 'sum' }, { name: 'Max', value: 'max' }] },
    ],
  },
  { id: snowflake(), application_id: APP_ID, name: 'secret', description: 'Whisper something', options: [] },
  { id: snowflake(), application_id: APP_ID, name: 'feedback', description: 'Open a feedback form', options: [] },
];

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
  /** Bodies received by `POST /interactions`. */
  interactions: Record<string, unknown>[];
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
  let settings: Record<string, unknown> = { default_delivery_mode: 'standard', status: 'online', locale: 'en-US' };
  const messages = new Map<string, unknown[]>();
  const interactions: Record<string, unknown>[] = [];
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

  const botMessage = (channelId: string, interactionId: string, extra: Record<string, unknown>) => {
    const message = {
      id: snowflake(),
      channel_id: channelId,
      guild_id: guilds.find((g) => g.channels.some((c) => c.id === channelId))?.id ?? null,
      author: BOT,
      application_id: APP_ID,
      timestamp: new Date().toISOString(),
      edited_timestamp: null,
      mention_everyone: false,
      mentions: [],
      mention_roles: [],
      attachments: [],
      embeds: [],
      pinned: false,
      type: 20,
      interaction_metadata: { id: interactionId, type: 2, user: USER },
      ...extra,
    };
    messages.set(channelId, [...(messages.get(channelId) ?? []), message]);
    dispatch('MESSAGE_CREATE', message);
  };

  /** Plays the bot side of an interaction after a short delay so the deferred state is observable. */
  const respondToInteraction = (id: string, body: Record<string, unknown>) => {
    const channelId = String(body.channel_id);
    const data = (body.data ?? {}) as Record<string, unknown>;
    setTimeout(() => {
      if (body.type === 2 && data.name === 'roll') {
        const sides = Number(((data.options as { value: number }[])[0] ?? { value: 6 }).value);
        botMessage(channelId, id, {
          content: `You rolled a ${sides}`,
          components: [
            {
              type: 1,
              components: [
                { type: 2, style: 1, label: 'Roll again', custom_id: 'again' },
                { type: 3, custom_id: 'pick', placeholder: 'Pick a die', options: [{ label: 'd6', value: 'd6' }, { label: 'd20', value: 'd20' }] },
              ],
            },
          ],
        });
      } else if (body.type === 2 && data.name === 'secret') {
        botMessage(channelId, id, { content: 'Only for your eyes', flags: 64 });
      } else if (body.type === 2 && data.name === 'feedback') {
        dispatch('INTERACTION_MODAL_CREATE', {
          interaction_id: id,
          channel_id: channelId,
          data: { custom_id: 'feedback-form', title: 'Send feedback', components: [{ type: 1, components: [{ type: 4, custom_id: 'text', label: 'Your thoughts', style: 2, required: true }] }] },
        });
      } else if (body.type === 3) {
        const values = (data.values as string[] | undefined)?.join(',');
        botMessage(channelId, id, { content: `Component ${String(data.custom_id)}${values ? ` chose ${values}` : ' pressed'}` });
      } else if (body.type === 5) {
        const text = (data.components as { components: { value: string }[] }[])[0]?.components[0]?.value ?? '';
        botMessage(channelId, id, { content: `Thanks for the feedback: ${text}` });
      }
    }, 1200);
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
    if (path === '/users/@me/settings') {
      if (req.method === 'PATCH') settings = { ...settings, ...body };
      return json(res, 200, settings);
    }
    if (path === '/oauth2/authorize' && req.method === 'GET') return json(res, 200, { application: { id: '11', name: 'Study helper', icon: null, description: 'Fixture app' }, user: USER, guilds: guilds.map((g) => ({ id: g.id, name: g.name, icon: null, permissions: '8', bot_permissions: null, installation_revision: 'absent:0' })), scopes: ['bot', 'applications.commands'], permissions: '2048' });
    if (path === '/voice/regions') return json(res, 200, [{ id: 'eu-west', name: 'Europe West', optimal: true }]);
    if (path === '/guilds' && req.method === 'POST') {
      const guild = addGuild(String(body.name ?? 'New server'));
      const payload = guildPayload(guild);
      dispatch('GUILD_CREATE', payload);
      return json(res, 201, payload);
    }
    if (path === '/applications') return json(res, 200, [{ id: APP_ID, name: 'Dice Bot', icon: null, bot: BOT }]);
    if (path === `/applications/${APP_ID}/commands`) return json(res, 200, COMMANDS);
    if (/^\/guilds\/\d+\/application-command-index$/.test(path)) {
      return json(res, 200, { applications: [{ id: APP_ID, name: 'Dice Bot', icon: null, bot_id: BOT.id }], application_commands: COMMANDS });
    }
    if (path === '/interactions' && req.method === 'POST') {
      interactions.push(body);
      const id = snowflake();
      respondToInteraction(id, body);
      return json(res, 201, { id });
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
              user_settings: settings,
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
    interactions,
    close: () =>
      new Promise<void>((resolve) => {
        for (const ws of sockets) ws.terminate();
        wss.close();
        server.close(() => resolve());
      }),
  };
}
