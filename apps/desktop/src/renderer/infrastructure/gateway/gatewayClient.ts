/**
 * Gateway client implementing P7: HELLO → IDENTIFY/RESUME, jittered heartbeats
 * with zombie detection, RECONNECT/INVALID_SESSION handling, close-code policy,
 * exponential backoff and a client-side send budget (120 per 60 s).
 */
import {
  ALL_INTENTS,
  FATAL_CLOSE_CODES,
  GatewayOp,
  NON_RESUMABLE_CLOSE_CODES,
  type GatewayFrame,
  type HelloPayload,
  type IdentifyPayload,
  type PresenceUpdatePayload,
} from '@discordy/core/contracts/gateway';
import { reconnectDelay } from '@discordy/core/domain/backoff';
import type { GatewayPort, GatewayState } from '@renderer/application/ports/gateway';
import { Listeners } from '../net/emitter';
import { SOCKET_OPEN, type SocketFactory, type SocketLike } from '../net/socket';

export interface GatewayClientOptions {
  url: string;
  getToken: () => string | null;
  getDeviceId: () => string | null;
  properties: IdentifyPayload['properties'];
  socketFactory: SocketFactory;
  intents?: number;
  presence?: () => PresenceUpdatePayload | undefined;
  random?: () => number;
}

const SEND_LIMIT = 115; // 120/60 s minus headroom reserved for heartbeats
const SEND_WINDOW_MS = 60_000;
const ZOMBIE_CLOSE = 4900;

export class GatewayClient implements GatewayPort {
  state: GatewayState = 'idle';
  sequence: number | null = null;
  sessionId: string | null = null;

  private socket: SocketLike | null = null;
  private resumeUrl: string | null = null;
  private heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private acked = true;
  private attempts = 0;
  private manualClose = false;
  private sentAt: number[] = [];
  private queue: string[] = [];
  private lastHeartbeatSentAt = 0;
  latencyMs: number | null = null;

  private readonly dispatch = new Listeners<[string, unknown]>();
  private readonly stateChange = new Listeners<[GatewayState]>();
  private readonly fatal = new Listeners<[number]>();
  private readonly opFrames = new Listeners<[number, unknown]>();
  private readonly random: () => number;

  constructor(private readonly options: GatewayClientOptions) {
    this.random = options.random ?? Math.random;
  }

  onDispatch(listener: (event: string, data: unknown) => void): () => void {
    return this.dispatch.add(listener);
  }

  onState(listener: (state: GatewayState) => void): () => void {
    return this.stateChange.add(listener);
  }

  onFatal(listener: (code: number) => void): () => void {
    return this.fatal.add(listener);
  }

  /** Non-dispatch frames such as E2EE_ENVELOPE (20), P2P_SIGNAL (22) and WATCH_TOGETHER (24). */
  onOp(listener: (op: number, data: unknown) => void): () => void {
    return this.opFrames.add(listener);
  }

  connect(): void {
    this.manualClose = false;
    this.open(false);
  }

  disconnect(): void {
    this.manualClose = true;
    this.clearTimers();
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = null;
    this.queue = [];
    this.socket?.close(1000, 'client disconnect');
    this.detach();
    this.sessionId = null;
    this.sequence = null;
    this.setState('closed');
  }

  /** Forces a fresh IDENTIFY (RESUME does not repeat READY) so the gateway mints new TURN credentials. */
  renewSession(): void {
    if (this.manualClose || this.state === 'idle' || this.state === 'closed') return;
    this.sessionId = null;
    this.sequence = null;
    this.reconnect(false);
  }

  send(op: number, d: unknown): void {
    const frame = JSON.stringify({ op, d });
    if (op === GatewayOp.HEARTBEAT) {
      this.raw(frame);
      return;
    }
    this.queue.push(frame);
    this.flush();
  }

  private flush(): void {
    const now = Date.now();
    this.sentAt = this.sentAt.filter((t) => now - t < SEND_WINDOW_MS);
    while (this.queue.length > 0 && this.sentAt.length < SEND_LIMIT && this.socket?.readyState === SOCKET_OPEN) {
      this.raw(this.queue.shift()!);
      this.sentAt.push(now);
    }
    if (this.queue.length > 0 && !this.flushTimer) {
      const oldest = this.sentAt[0] ?? now;
      this.flushTimer = setTimeout(() => {
        this.flushTimer = null;
        this.flush();
      }, Math.max(50, SEND_WINDOW_MS - (now - oldest) + 10));
    }
  }

  private raw(frame: string): void {
    if (this.socket?.readyState === SOCKET_OPEN) this.socket.send(frame);
  }

  private open(resume: boolean): void {
    this.clearTimers();
    this.detach();
    const base = resume && this.resumeUrl ? this.resumeUrl : this.options.url;
    this.setState(resume ? 'resuming' : 'connecting');
    // resume_gateway_url may arrive with or without the /gateway path; never double it.
    const origin = base.replace(/\/+$/, '').replace(/\/gateway$/, '');
    const socket = this.options.socketFactory(`${origin}/gateway?v=1&encoding=json`);
    this.socket = socket;
    socket.onmessage = (event) => this.handleFrame(event.data);
    socket.onclose = (event) => this.handleClose(event.code);
    socket.onerror = () => undefined;
  }

  private detach(): void {
    if (!this.socket) return;
    this.socket.onmessage = null;
    this.socket.onclose = null;
    this.socket.onerror = null;
    this.socket.onopen = null;
    this.socket = null;
  }

  private handleFrame(data: string): void {
    let frame: GatewayFrame;
    try {
      frame = JSON.parse(data) as GatewayFrame;
    } catch {
      return;
    }
    switch (frame.op) {
      case GatewayOp.HELLO:
        this.startHeartbeat((frame.d as HelloPayload).heartbeat_interval);
        this.authenticate();
        break;
      case GatewayOp.HEARTBEAT:
        this.beat();
        break;
      case GatewayOp.HEARTBEAT_ACK:
        this.acked = true;
        this.latencyMs = Date.now() - this.lastHeartbeatSentAt;
        break;
      case GatewayOp.RECONNECT:
        this.reconnect(true);
        break;
      case GatewayOp.INVALID_SESSION:
        this.handleInvalidSession(frame.d === true);
        break;
      case GatewayOp.DISPATCH:
        this.handleDispatch(frame);
        break;
      default:
        this.opFrames.emit(frame.op, frame.d);
    }
  }

  private handleDispatch(frame: GatewayFrame): void {
    if (typeof frame.s === 'number') this.sequence = frame.s;
    if (frame.t === 'READY') {
      const ready = frame.d as { session_id: string; resume_gateway_url?: string };
      this.sessionId = ready.session_id;
      this.resumeUrl = ready.resume_gateway_url ?? null;
      this.attempts = 0;
      this.setState('ready');
    } else if (frame.t === 'RESUMED') {
      this.attempts = 0;
      this.setState('ready');
    }
    if (frame.t) this.dispatch.emit(frame.t, frame.d);
  }

  private authenticate(): void {
    const token = this.options.getToken();
    if (!token) {
      this.disconnect();
      this.fatal.emit(4003);
      return;
    }
    if (this.sessionId && this.sequence !== null) {
      this.raw(JSON.stringify({ op: GatewayOp.RESUME, d: { token, session_id: this.sessionId, seq: this.sequence } }));
      return;
    }
    this.setState('identifying');
    const identify: IdentifyPayload = {
      token,
      device_id: this.options.getDeviceId() ?? '0',
      intents: this.options.intents ?? ALL_INTENTS,
      properties: this.options.properties,
    };
    const presence = this.options.presence?.();
    if (presence) identify.presence = presence;
    this.raw(JSON.stringify({ op: GatewayOp.IDENTIFY, d: identify }));
  }

  private startHeartbeat(interval: number): void {
    this.acked = true;
    const tick = () => {
      if (!this.acked) {
        this.reconnect(true);
        return;
      }
      this.beat();
      this.heartbeatTimer = setTimeout(tick, interval);
    };
    this.heartbeatTimer = setTimeout(tick, Math.floor(interval * this.random()));
  }

  private beat(): void {
    this.acked = false;
    this.lastHeartbeatSentAt = Date.now();
    this.send(GatewayOp.HEARTBEAT, this.sequence);
  }

  private handleInvalidSession(resumable: boolean): void {
    if (!resumable) {
      this.sessionId = null;
      this.sequence = null;
    }
    this.clearTimers();
    this.socket?.close(ZOMBIE_CLOSE, 'invalid session');
    this.detach();
    this.setState('reconnecting');
    const wait = 1000 + Math.floor(this.random() * 4000);
    this.reconnectTimer = setTimeout(() => this.open(resumable), wait);
  }

  private reconnect(resume: boolean): void {
    this.clearTimers();
    this.socket?.close(ZOMBIE_CLOSE, 'reconnecting');
    this.detach();
    this.scheduleReconnect(resume);
  }

  private handleClose(code: number): void {
    this.clearTimers();
    this.detach();
    if (this.manualClose) {
      this.setState('closed');
      return;
    }
    if (FATAL_CLOSE_CODES.has(code)) {
      this.sessionId = null;
      this.sequence = null;
      this.setState('closed');
      this.fatal.emit(code);
      return;
    }
    if (NON_RESUMABLE_CLOSE_CODES.has(code)) {
      this.sessionId = null;
      this.sequence = null;
    }
    this.scheduleReconnect(this.sessionId !== null);
  }

  private scheduleReconnect(resume: boolean): void {
    this.setState('reconnecting');
    const delay = reconnectDelay(this.attempts, this.random);
    this.attempts += 1;
    this.reconnectTimer = setTimeout(() => this.open(resume), delay);
  }

  private clearTimers(): void {
    if (this.heartbeatTimer) clearTimeout(this.heartbeatTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.heartbeatTimer = null;
    this.reconnectTimer = null;
  }

  private setState(state: GatewayState): void {
    if (this.state === state) return;
    this.state = state;
    this.stateChange.emit(state);
  }
}
