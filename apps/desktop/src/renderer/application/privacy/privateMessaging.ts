/** Facade over the private delivery modes; the composition root wires one instance per signed-in session. */
import { GatewayOp, type ChannelDeliveryModeUpdate, type E2EEEnvelope, type P2PSignal, type P2PSignalFailed } from '@shared/contracts/gateway';
import type { CryptoBridge } from '@shared/ipc';
import type { ApiPort } from '../ports/api';
import type { GatewayPort } from '../ports/gateway';
import { useGuildStore } from '../stores/guildStore';
import { AttachmentService } from './attachmentService';
import { DeviceDirectory } from './deviceDirectory';
import { EphemeralService } from './ephemeralService';
import { LocalHistory } from './localHistory';
import { MessageSender } from './messageSender';
import { P2PService, type PeerConnectionConfig, type PeerConnectionLike } from './p2pService';
import type { SelfIdentity } from './types';

export interface PrivateMessagingDeps {
  gateway: GatewayPort;
  api: ApiPort;
  /** Undefined when the native module is absent: private modes then fail loudly instead of degrading. */
  crypto: CryptoBridge | undefined;
  getSelf: () => SelfIdentity;
  createPeerConnection: (config: PeerConnectionConfig) => PeerConnectionLike;
  /** Downloads an encrypted attachment from the CDN. */
  fetchBytes: (url: string) => Promise<Uint8Array>;
  /** Public CDN origin of the active connection profile. */
  cdnUrl: () => string;
  now?: () => number;
  iceServers?: () => PeerConnectionConfig['iceServers'];
  deviceLabel?: string;
}

export class PrivateMessaging {
  readonly sender: MessageSender;
  readonly ephemeral: EphemeralService;
  readonly p2p: P2PService;
  readonly attachments: AttachmentService;

  constructor(private readonly deps: PrivateMessagingDeps) {
    const now = deps.now ?? Date.now;
    const devices = new DeviceDirectory(deps.api, now);
    const history = new LocalHistory(() => deps.crypto);
    this.attachments = new AttachmentService({ api: deps.api, fetchBytes: deps.fetchBytes, cdnBase: deps.cdnUrl });
    this.ephemeral = new EphemeralService({
      gateway: deps.gateway,
      api: deps.api,
      crypto: deps.crypto,
      devices,
      history,
      attachments: this.attachments,
      getSelf: deps.getSelf,
      now,
    });
    this.p2p = new P2PService({
      gateway: deps.gateway,
      crypto: deps.crypto,
      devices,
      history,
      attachments: this.attachments,
      getSelf: deps.getSelf,
      createPeerConnection: deps.createPeerConnection,
      now,
      iceServers: deps.iceServers,
    });
    this.sender = new MessageSender({ api: deps.api, ephemeral: this.ephemeral, p2p: this.p2p, history, now });
  }

  /** Step 1 (before registering the device): opens the encrypted store and returns the identity public key (base64). */
  initialiseIdentity(): Promise<string> {
    return this.ephemeral.initialiseIdentity(this.deps.deviceLabel ?? 'Discordy desktop');
  }

  /** Step 2 (after READY): publishes key packages when needed. Failures never block the rest of the app. */
  async start(): Promise<void> {
    await this.ephemeral.start();
  }

  stop(): void {
    this.ephemeral.stop();
    this.p2p.stop();
  }

  /** Feed gateway op frames (op 20 and 22; other ops are ignored). */
  handleGatewayOp(op: number, data: unknown): void {
    if (op === GatewayOp.E2EE_ENVELOPE) void this.ephemeral.handleEnvelope(data as E2EEEnvelope);
    else if (op === GatewayOp.P2P_SIGNAL) void this.p2p.handleSignal(data as P2PSignal);
  }

  /** Someone left, was kicked or banned: the remaining devices commit their removal from every group of the guild. */
  private dropGuildMember(event: { guild_id: string; user?: { id: string } }): void {
    if (event.user?.id === this.deps.getSelf().userId) return;
    void this.ephemeral.reconcileAll(event.guild_id).catch(() => undefined);
  }

  private dropRecipient(event: { channel_id: string; user?: { id: string } }): void {
    if (event.user?.id === this.deps.getSelf().userId) return;
    void this.ephemeral.reconcileMembership(event.channel_id).catch(() => undefined);
  }

  /** Feed gateway DISPATCH events (P2P_SIGNAL_FAILED, CHANNEL_DELIVERY_MODE_UPDATE). */
  handleDispatch(event: string, data: unknown): void {
    if (event === 'P2P_SIGNAL_FAILED') this.p2p.handleSignalFailed(data as P2PSignalFailed);
    else if (event === 'GUILD_MEMBER_REMOVE' || event === 'GUILD_BAN_ADD') this.dropGuildMember(data as { guild_id: string; user?: { id: string } });
    else if (event === 'CHANNEL_RECIPIENT_REMOVE') this.dropRecipient(data as { channel_id: string; user?: { id: string } });
    else if (event === 'USER_DEVICES_UPDATE') void this.ephemeral.reconcileAll().catch(() => undefined);
    else if (event === 'CHANNEL_DELIVERY_MODE_UPDATE') {
      const update = data as ChannelDeliveryModeUpdate;
      const guilds = useGuildStore.getState();
      const channel = guilds.channels[update.channel_id];
      if (channel) guilds.upsertChannel({ ...channel, delivery_mode: update.delivery_mode });
    }
  }
}
