/**
 * Watch Together (gateway op 24). Every participant plays their own copy of the
 * source; play/pause/seek anchors are exchanged on the server clock and a
 * corrective seek is applied when local playback drifts.
 */
import { GatewayOp, type WatchTogetherAction, type WatchTogetherPayload } from '@discordy/core/contracts/gateway';
import { estimateServerOffset, needsResync, playbackPosition, type PlaybackAnchor } from '@discordy/core/domain/watchTogether';
import type { GatewayPort } from '@renderer/application/ports/gateway';
import { usePrivacyStore } from '@renderer/application/stores/privacyStore';
import { localReference, validateWatchUrl, type WatchSource } from './watchUrl';

export type UserPlayerAction = { action: 'play' | 'pause' | 'seek'; positionMs: number };

/** Media element abstraction; `ElementPlayer` adapts an HTMLMediaElement. */
export interface PlayerPort {
  load(source: WatchSource, localUrl?: string): Promise<void>;
  play(): Promise<void>;
  pause(): void;
  seek(positionMs: number): void;
  positionMs(): number;
  isPlaying(): boolean;
  /** Fires only for user-initiated changes, never for programmatic ones. */
  onUserAction(listener: (action: UserPlayerAction) => void): () => void;
}

export type WatchStatus =
  | { state: 'idle' }
  | { state: 'loading'; source: WatchSource }
  | { state: 'awaiting_local_file'; name: string }
  | { state: 'ready'; source: WatchSource }
  | { state: 'error'; message: string };

export interface WatchTogetherDeps {
  gateway: Pick<GatewayPort, 'send' | 'onOp'>;
  userId(): string | null;
  now?: () => number;
  driftCheckMs?: number;
}

interface Attachment {
  channelId: string;
  player: PlayerPort;
  stopUserActions: () => void;
}

export class WatchTogetherService {
  private attachment: Attachment | null = null;
  private anchor: (PlaybackAnchor & { source?: WatchSource }) | null = null;
  private status: WatchStatus = { state: 'idle' };
  private readonly statusListeners = new Set<(status: WatchStatus) => void>();
  private readonly pendingSends = new Map<string, number>();
  private driftTimer: ReturnType<typeof setInterval> | null = null;
  private applying = false;
  private readonly stopOps: () => void;

  constructor(private readonly deps: WatchTogetherDeps) {
    this.stopOps = deps.gateway.onOp((op, data) => {
      if (op === GatewayOp.WATCH_TOGETHER) void this.onRemote(data as WatchTogetherPayload);
    });
  }

  private now(): number {
    return (this.deps.now ?? Date.now)();
  }

  private offset(): number {
    return usePrivacyStore.getState().serverOffsetMs;
  }

  getStatus(): WatchStatus {
    return this.status;
  }

  onStatus(listener: (status: WatchStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  private setStatus(status: WatchStatus): void {
    this.status = status;
    for (const l of [...this.statusListeners]) l(status);
  }

  /** Binds a player (usually an `ElementPlayer`) to a channel's session. Returns a detach function. */
  attachPlayer(channelId: string, player: PlayerPort): () => void {
    this.detach();
    const stopUserActions = player.onUserAction((a) => {
      if (!this.applying) this.send(a.action, a.positionMs);
    });
    this.attachment = { channelId, player, stopUserActions };
    this.driftTimer = setInterval(() => void this.correctDrift(), this.deps.driftCheckMs ?? 1000);
    const anchor = usePrivacyStore.getState().watch[channelId];
    if (anchor) void this.onRemote(anchor);
    return () => this.detach();
  }

  detach(): void {
    this.attachment?.stopUserActions();
    this.attachment = null;
    if (this.driftTimer) clearInterval(this.driftTimer);
    this.driftTimer = null;
  }

  dispose(): void {
    this.detach();
    this.stopOps();
  }

  // ---- local intents -----------------------------------------------------

  /** Shares a source with the channel. Accepts an https media link or `local:<file name>`. */
  async load(raw: string, localUrl?: string): Promise<void> {
    const checked = validateWatchUrl(raw);
    if (!checked.ok) {
      this.setStatus({ state: 'error', message: checked.reason });
      return;
    }
    await this.applyLoad(checked.source, localUrl);
    this.send('load', 0, checked.source.kind === 'remote' ? checked.source.url : localReference(checked.source.name));
  }

  /** Supplies the local file for a `local:` source announced by a peer (or chosen by us). */
  async provideLocalFile(name: string, blobUrl: string): Promise<void> {
    await this.applyLoad({ kind: 'local', name }, blobUrl);
    const anchor = this.anchor;
    if (anchor) await this.applyAnchor(anchor);
  }

  play(): void {
    const player = this.attachment?.player;
    if (!player) return;
    this.send('play', player.positionMs());
    void this.guardApply(() => player.play());
  }

  pause(): void {
    const player = this.attachment?.player;
    if (!player) return;
    this.send('pause', player.positionMs());
    void this.guardApply(async () => player.pause());
  }

  seek(positionMs: number): void {
    const player = this.attachment?.player;
    if (!player) return;
    this.send('seek', positionMs);
    void this.guardApply(async () => player.seek(positionMs));
  }

  // ---- protocol ----------------------------------------------------------

  private send(action: WatchTogetherAction, positionMs: number, url?: string): void {
    const attachment = this.attachment;
    if (!attachment) return;
    const sentAt = this.now();
    this.pendingSends.set(`${action}:${Math.round(positionMs)}`, sentAt);
    this.anchor = { action, position_ms: positionMs, at_server_ms: sentAt + this.offset(), source: this.anchor?.source };
    const payload: WatchTogetherPayload = {
      channel_id: attachment.channelId,
      action,
      position_ms: positionMs,
      at_server_ms: sentAt + this.offset(),
      ...(url ? { url } : {}),
    };
    this.deps.gateway.send(GatewayOp.WATCH_TOGETHER, payload);
  }

  private async guardApply(fn: () => Promise<void>): Promise<void> {
    this.applying = true;
    try {
      await fn();
    } catch {
      // autoplay restrictions or a revoked source: the next anchor will retry
    } finally {
      setTimeout(() => (this.applying = false), 0);
    }
  }

  private async applyLoad(source: WatchSource, localUrl?: string): Promise<void> {
    const player = this.attachment?.player;
    if (source.kind === 'local' && !localUrl) {
      this.setStatus({ state: 'awaiting_local_file', name: source.name });
      return;
    }
    if (!player) return;
    this.setStatus({ state: 'loading', source });
    try {
      await this.guardApply(() => player.load(source, localUrl));
      this.setStatus({ state: 'ready', source });
    } catch (error) {
      this.setStatus({ state: 'error', message: error instanceof Error ? error.message : 'Could not load this source' });
    }
    this.anchor = { action: 'load', position_ms: 0, at_server_ms: this.now() + this.offset(), source };
  }

  private async onRemote(payload: WatchTogetherPayload): Promise<void> {
    const attachment = this.attachment;
    if (!attachment || payload.channel_id !== attachment.channelId) return;
    usePrivacyStore.getState().setWatch(payload.channel_id, payload);

    if (payload.user_id && payload.user_id === this.deps.userId()) {
      const key = `${payload.action}:${Math.round(payload.position_ms)}`;
      const sent = this.pendingSends.get(key);
      if (sent !== undefined) {
        this.pendingSends.delete(key);
        usePrivacyStore.getState().setServerOffset(estimateServerOffset(sent, this.now(), payload.at_server_ms));
      }
      return;
    }

    if (payload.action === 'load') {
      const checked = payload.url ? validateWatchUrl(payload.url) : null;
      if (!checked) return;
      if (!checked.ok) {
        this.setStatus({ state: 'error', message: checked.reason });
        return;
      }
      this.anchor = { action: 'load', position_ms: payload.position_ms, at_server_ms: payload.at_server_ms, source: checked.source };
      await this.applyLoad(checked.source);
      return;
    }

    this.anchor = { action: payload.action, position_ms: payload.position_ms, at_server_ms: payload.at_server_ms, source: this.anchor?.source };
    await this.applyAnchor(this.anchor);
  }

  private async applyAnchor(anchor: PlaybackAnchor): Promise<void> {
    const player = this.attachment?.player;
    if (!player || this.status.state !== 'ready') return;
    const expected = playbackPosition(anchor, { localNowMs: this.now(), serverOffsetMs: this.offset() });
    await this.guardApply(async () => {
      if (needsResync(player.positionMs(), expected)) player.seek(expected);
      if (anchor.action === 'pause') player.pause();
      else if (anchor.action === 'play' || (anchor.action === 'seek' && player.isPlaying())) await player.play();
    });
  }

  private async correctDrift(): Promise<void> {
    const player = this.attachment?.player;
    const anchor = this.anchor;
    if (!player || !anchor || anchor.action !== 'play' || !player.isPlaying() || this.status.state !== 'ready') return;
    const expected = playbackPosition(anchor, { localNowMs: this.now(), serverOffsetMs: this.offset() });
    if (needsResync(player.positionMs(), expected)) await this.guardApply(async () => player.seek(expected));
  }
}

