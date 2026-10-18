/**
 * P2P delivery: a WebRTC DataChannel per peer device, signalled over gateway op 22.
 * Each side signs its DTLS fingerprint with its device identity key and verifies the
 * peer's signature against the identity key published in the device directory, so a
 * relaying gateway cannot splice itself into the session. Nothing is queued anywhere:
 * if the peer is offline the send fails.
 */
import type { Channel, User } from '@shared/contracts/rest';
import { GatewayOp, type P2PSignal, type P2PSignalFailed, type P2PSignalKind } from '@shared/contracts/gateway';
import type { CryptoBridge } from '@shared/ipc';
import { extractDtlsFingerprint, fingerprintSigningPayload, safetyNumberGroups } from '@renderer/domain/p2pIdentity';
import type { GatewayPort } from '../ports/gateway';
import { useGuildStore } from '../stores/guildStore';
import { useMessageStore, type ChatMessage } from '../stores/messageStore';
import { usePrivacyStore } from '../stores/privacyStore';
import { useSessionStore } from '../stores/sessionStore';
import type { DeviceDirectory } from './deviceDirectory';
import type { LocalHistory } from './localHistory';
import {
  PrivateDeliveryError,
  buildPrivateMessage,
  encryptionUnavailable,
  generateLocalId,
  utf8ToB64,
  type PrivatePayload,
  type SelfIdentity,
  type SendInput,
} from './types';

export interface DataChannelLike {
  readyState: string;
  onopen: (() => void) | null;
  onclose: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  send(data: string): void;
  close(): void;
}

export interface PeerConnectionLike {
  localDescription: { type: string; sdp?: string } | null;
  connectionState: string;
  onicecandidate: ((event: { candidate: { toJSON(): unknown } | null }) => void) | null;
  ondatachannel: ((event: { channel: DataChannelLike }) => void) | null;
  onconnectionstatechange: (() => void) | null;
  createDataChannel(label: string, init?: { ordered?: boolean }): DataChannelLike;
  createOffer(): Promise<{ type: string; sdp?: string }>;
  createAnswer(): Promise<{ type: string; sdp?: string }>;
  setLocalDescription(description: { type: string; sdp?: string }): Promise<void>;
  setRemoteDescription(description: { type: string; sdp?: string }): Promise<void>;
  addIceCandidate(candidate: unknown): Promise<void>;
  close(): void;
}

export interface PeerConnectionConfig {
  iceServers: { urls: string | string[]; username?: string; credential?: string }[];
}

export interface P2PDeps {
  gateway: Pick<GatewayPort, 'send'>;
  crypto: CryptoBridge | undefined;
  devices: DeviceDirectory;
  history: LocalHistory;
  getSelf: () => SelfIdentity;
  createPeerConnection: (config: PeerConnectionConfig) => PeerConnectionLike;
  now: () => number;
  /** Evaluated per connection so refreshed TURN credentials apply to new links. */
  iceServers?: () => PeerConnectionConfig['iceServers'];
  connectTimeoutMs?: number;
}

interface Link {
  key: string;
  channelId: string;
  peerUserId: string;
  peerDeviceId: string;
  pc: PeerConnectionLike;
  channel: DataChannelLike | null;
  initiator: boolean;
  remoteSet: boolean;
  pendingIce: unknown[];
  opened: Promise<void>;
  resolveOpen: () => void;
  rejectOpen: (error: Error) => void;
}

const DEFAULT_CONNECT_TIMEOUT_MS = 10_000;
const linkKey = (channelId: string, deviceId: string) => `${channelId}:${deviceId}`;

function allFingerprints(sdp: string): string[] {
  return sdp
    .split(/\r?\n/)
    .filter((l) => l.startsWith('a=fingerprint:'))
    .map((l) => l.slice('a=fingerprint:'.length).trim());
}

/** One unambiguous fingerprint, or null when the SDP carries none or conflicting ones. */
function uniqueFingerprint(sdp: string): string | null {
  const all = new Set(allFingerprints(sdp));
  return all.size === 1 ? (extractDtlsFingerprint(sdp) ?? null) : null;
}

export class P2PService {
  private readonly links = new Map<string, Link>();

  constructor(private readonly deps: P2PDeps) {}

  /** Sends to every connected peer device of the channel, connecting first when needed. */
  async send(channel: Channel, input: SendInput): Promise<ChatMessage> {
    await this.requireCrypto();
    const author = this.selfUser();
    const peers = await this.peerDevices(channel);
    if (peers.length === 0) throw new PrivateDeliveryError('peer_offline', 'Peer offline: no devices to reach.');

    const open: Link[] = [];
    const failures: string[] = [];
    for (const peer of peers) {
      try {
        open.push(await this.ensureLink(channel.id, peer.userId, peer.deviceId));
      } catch (error) {
        failures.push(error instanceof Error ? error.message : String(error));
      }
    }
    if (open.length === 0) {
      const reason = usePrivacyStore.getState().p2p[channel.id]?.state === 'unverified' ? 'unverified_peer' : 'peer_offline';
      throw new PrivateDeliveryError(reason, failures[0] ?? 'Peer offline.');
    }

    const id = generateLocalId(this.deps.now());
    const payload: PrivatePayload = {
      v: 1,
      content: input.content,
      nonce: id,
      timestamp: new Date(this.deps.now()).toISOString(),
      reply_to: input.replyTo ?? null,
    };
    const wire = JSON.stringify({ t: 'msg', id, ...payload });
    for (const link of open) link.channel?.send(wire);

    const message = buildPrivateMessage({ id, channel, author, payload, mode: 'p2p' });
    await this.deps.history.save(message);
    useMessageStore.getState().receive(message);
    return message;
  }

  /** Relays signalling frames (op 22). */
  async handleSignal(signal: P2PSignal): Promise<void> {
    const self = this.deps.getSelf();
    if (signal.to_device_id !== self.deviceId) return;
    try {
      if (signal.kind === 'offer') await this.onOffer(signal);
      else if (signal.kind === 'answer') await this.onAnswer(signal);
      else if (signal.kind === 'ice') await this.onIce(signal);
      else this.closeLink(linkKey(signal.channel_id, signal.from_device_id), 'idle');
    } catch (error) {
      usePrivacyStore.getState().setP2P(signal.channel_id, 'failed', false, error instanceof Error ? error.message : String(error));
    }
  }

  /** The gateway could not relay a signal because the peer has no live session. */
  handleSignalFailed(failure: P2PSignalFailed): void {
    const state = failure.error === 'peer_offline' ? 'peer_offline' : 'failed';
    for (const link of [...this.links.values()]) {
      if (link.channelId === failure.channel_id && link.peerUserId === failure.to_user_id && (!failure.to_device_id || link.peerDeviceId === failure.to_device_id)) {
        link.rejectOpen(new PrivateDeliveryError('peer_offline', 'Peer offline: they must be online to receive P2P messages.'));
        this.closeLink(link.key, state);
      }
    }
    usePrivacyStore.getState().setP2P(failure.channel_id, state, false, failure.error);
  }

  /** Six groups of five digits derived from both identity keys; compare out of band. */
  async safetyNumber(peerUserId: string, peerDeviceId: string): Promise<string[]> {
    const peerKey = await this.deps.devices.identityKey(peerUserId, peerDeviceId);
    if (!peerKey) throw new PrivateDeliveryError('unverified_peer', 'The peer has no published identity key.');
    const keys = [this.deps.getSelf().identityKeyB64, peerKey].sort();
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(keys.join('|')));
    const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
    return safetyNumberGroups(hex);
  }

  closeChannel(channelId: string): void {
    for (const link of [...this.links.values()]) {
      if (link.channelId === channelId) this.sendSignal(link, 'bye', '', '');
      if (link.channelId === channelId) this.closeLink(link.key, 'idle');
    }
  }

  stop(): void {
    for (const link of [...this.links.values()]) {
      this.sendSignal(link, 'bye', '', '');
      this.closeLink(link.key, 'idle');
    }
  }

  // ---- connection setup ------------------------------------------------------------

  private async ensureLink(channelId: string, peerUserId: string, peerDeviceId: string): Promise<Link> {
    const key = linkKey(channelId, peerDeviceId);
    const existing = this.links.get(key);
    if (existing?.channel?.readyState === 'open') return existing;
    const link = existing ?? (await this.dial(channelId, peerUserId, peerDeviceId));
    const timeout = this.deps.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new PrivateDeliveryError('peer_offline', 'Peer offline: the connection attempt timed out.')), timeout);
    });
    try {
      await Promise.race([link.opened, timedOut]);
    } catch (error) {
      this.closeLink(key, usePrivacyStore.getState().p2p[channelId]?.state === 'unverified' ? 'unverified' : 'peer_offline');
      throw error;
    } finally {
      clearTimeout(timer);
    }
    return link;
  }

  private newLink(channelId: string, peerUserId: string, peerDeviceId: string, initiator: boolean): Link {
    const pc = this.deps.createPeerConnection({ iceServers: this.deps.iceServers?.() ?? [] });
    let resolveOpen!: () => void;
    let rejectOpen!: (error: Error) => void;
    const opened = new Promise<void>((resolve, reject) => {
      resolveOpen = resolve;
      rejectOpen = reject;
    });
    opened.catch(() => undefined);
    const link: Link = {
      key: linkKey(channelId, peerDeviceId),
      channelId,
      peerUserId,
      peerDeviceId,
      pc,
      channel: null,
      initiator,
      remoteSet: false,
      pendingIce: [],
      opened,
      resolveOpen,
      rejectOpen,
    };
    pc.onicecandidate = (event) => {
      if (event.candidate) this.sendSignal(link, 'ice', JSON.stringify(event.candidate.toJSON()), '');
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') this.closeLink(link.key, 'peer_offline');
    };
    pc.ondatachannel = (event) => this.attachChannel(link, event.channel);
    this.links.set(link.key, link);
    usePrivacyStore.getState().setP2P(channelId, 'connecting', false);
    return link;
  }

  private async dial(channelId: string, peerUserId: string, peerDeviceId: string): Promise<Link> {
    const crypto = await this.requireCrypto();
    const link = this.newLink(channelId, peerUserId, peerDeviceId, true);
    this.attachChannel(link, link.pc.createDataChannel('discordy', { ordered: true }));
    const offer = await link.pc.createOffer();
    await link.pc.setLocalDescription(offer);
    const sdp = link.pc.localDescription?.sdp ?? offer.sdp ?? '';
    const signature = await this.signFingerprint(crypto, channelId, this.deps.getSelf().deviceId, peerDeviceId, sdp);
    this.sendSignal(link, 'offer', JSON.stringify({ type: 'offer', sdp }), signature);
    return link;
  }

  private async onOffer(signal: P2PSignal): Promise<void> {
    const crypto = await this.requireCrypto();
    const self = this.deps.getSelf();
    const key = linkKey(signal.channel_id, signal.from_device_id);
    const existing = this.links.get(key);
    if (existing) {
      // Glare: both sides offered. The lower device id keeps its offer; the other yields.
      if (existing.initiator && BigInt(self.deviceId) < BigInt(signal.from_device_id)) return;
      this.closeLink(key, 'connecting');
    }
    const description = JSON.parse(signal.payload) as { type: string; sdp: string };
    if (!(await this.verifyPeer(crypto, signal, description.sdp, signal.from_device_id, self.deviceId))) return;

    const link = this.newLink(signal.channel_id, signal.from_user_id, signal.from_device_id, false);
    await link.pc.setRemoteDescription({ type: 'offer', sdp: description.sdp });
    await this.flushIce(link);
    const answer = await link.pc.createAnswer();
    await link.pc.setLocalDescription(answer);
    const sdp = link.pc.localDescription?.sdp ?? answer.sdp ?? '';
    const signature = await this.signFingerprint(crypto, signal.channel_id, self.deviceId, signal.from_device_id, sdp);
    this.sendSignal(link, 'answer', JSON.stringify({ type: 'answer', sdp }), signature);
  }

  private async onAnswer(signal: P2PSignal): Promise<void> {
    const crypto = await this.requireCrypto();
    const link = this.links.get(linkKey(signal.channel_id, signal.from_device_id));
    if (!link || !link.initiator) return;
    const description = JSON.parse(signal.payload) as { type: string; sdp: string };
    if (!(await this.verifyPeer(crypto, signal, description.sdp, signal.from_device_id, this.deps.getSelf().deviceId))) {
      link.rejectOpen(new PrivateDeliveryError('unverified_peer', 'The peer could not prove its identity; connection refused.'));
      this.closeLink(link.key, 'unverified');
      return;
    }
    await link.pc.setRemoteDescription({ type: 'answer', sdp: description.sdp });
    await this.flushIce(link);
  }

  private async onIce(signal: P2PSignal): Promise<void> {
    const link = this.links.get(linkKey(signal.channel_id, signal.from_device_id));
    if (!link) return;
    const candidate: unknown = JSON.parse(signal.payload);
    if (link.remoteSet) await link.pc.addIceCandidate(candidate);
    else link.pendingIce.push(candidate);
  }

  private async flushIce(link: Link): Promise<void> {
    link.remoteSet = true;
    for (const candidate of link.pendingIce.splice(0)) await link.pc.addIceCandidate(candidate);
  }

  // ---- identity binding --------------------------------------------------------------

  private async signFingerprint(crypto: CryptoBridge, channelId: string, from: string, to: string, sdp: string): Promise<string> {
    const fingerprint = uniqueFingerprint(sdp);
    if (!fingerprint) throw new Error('Local SDP has no unambiguous DTLS fingerprint');
    return crypto.sign(utf8ToB64(fingerprintSigningPayload({ channelId, fromDeviceId: from, toDeviceId: to, fingerprint })));
  }

  private async verifyPeer(crypto: CryptoBridge, signal: P2PSignal, sdp: string, fromDeviceId: string, toDeviceId: string): Promise<boolean> {
    const refuse = (detail: string) => {
      usePrivacyStore.getState().setP2P(signal.channel_id, 'unverified', false, detail);
      return false;
    };
    const fingerprint = uniqueFingerprint(sdp);
    if (!fingerprint) return refuse('Peer SDP has no unambiguous DTLS fingerprint.');
    if (!signal.identity_sig_b64) return refuse('Peer did not sign its DTLS fingerprint.');
    const peerKey = await this.deps.devices.identityKey(signal.from_user_id, fromDeviceId);
    if (!peerKey) return refuse('Peer has no published identity key.');
    const payload = utf8ToB64(fingerprintSigningPayload({ channelId: signal.channel_id, fromDeviceId, toDeviceId, fingerprint }));
    const valid = await crypto.verify(peerKey, payload, signal.identity_sig_b64).catch(() => false);
    return valid ? true : refuse('Peer identity signature did not verify.');
  }

  // ---- data channel -------------------------------------------------------------------

  private attachChannel(link: Link, channel: DataChannelLike): void {
    link.channel = channel;
    channel.onopen = () => {
      usePrivacyStore.getState().setP2P(link.channelId, 'open', true);
      link.resolveOpen();
    };
    channel.onclose = () => this.closeLink(link.key, 'peer_offline');
    channel.onmessage = (event) => void this.onWire(link, event.data);
    if (channel.readyState === 'open') channel.onopen();
  }

  private async onWire(link: Link, data: unknown): Promise<void> {
    if (typeof data !== 'string') return;
    try {
      const parsed = JSON.parse(data) as Partial<PrivatePayload> & { t?: string; id?: string };
      if (parsed.t !== 'msg' || typeof parsed.id !== 'string' || typeof parsed.content !== 'string') return;
      const payload: PrivatePayload = {
        v: 1,
        content: parsed.content,
        nonce: parsed.id,
        timestamp: typeof parsed.timestamp === 'string' ? parsed.timestamp : new Date(this.deps.now()).toISOString(),
        reply_to: parsed.reply_to ?? null,
        attachments: [],
      };
      const channel = useGuildStore.getState().channels[link.channelId] ?? { id: link.channelId, guild_id: null };
      // The author is the verified link peer, never a field the peer supplies.
      const message = buildPrivateMessage({ id: parsed.id, channel, author: this.peerUser(link), payload, mode: 'p2p' });
      if (useMessageStore.getState().timelines[link.channelId]?.byId[message.id]) return;
      await this.deps.history.save(message);
      useMessageStore.getState().receive(message);
    } catch {
      // Malformed frames from a peer are ignored.
    }
  }

  // ---- helpers ---------------------------------------------------------------------------

  private async peerDevices(channel: Channel): Promise<{ userId: string; deviceId: string }[]> {
    const self = this.deps.getSelf();
    const recipients = (channel.recipients ?? []).filter((u) => u.id !== self.userId);
    const result: { userId: string; deviceId: string }[] = [];
    for (const user of recipients) {
      for (const device of await this.deps.devices.devices(user.id)) result.push({ userId: user.id, deviceId: device.device_id });
    }
    return result;
  }

  private sendSignal(link: Link, kind: P2PSignalKind, payload: string, identitySig: string): void {
    const self = this.deps.getSelf();
    const signal: P2PSignal = {
      channel_id: link.channelId,
      to_user_id: link.peerUserId,
      to_device_id: link.peerDeviceId,
      from_user_id: self.userId,
      from_device_id: self.deviceId,
      kind,
      payload,
      identity_sig_b64: identitySig,
    };
    this.deps.gateway.send(GatewayOp.P2P_SIGNAL, signal);
  }

  private closeLink(key: string, state: 'idle' | 'connecting' | 'peer_offline' | 'unverified' | 'failed'): void {
    const link = this.links.get(key);
    if (!link) return;
    this.links.delete(key);
    link.channel?.close();
    link.pc.close();
    link.rejectOpen(new PrivateDeliveryError('peer_offline', 'Peer offline.'));
    const stillOpen = [...this.links.values()].some((l) => l.channelId === link.channelId && l.channel?.readyState === 'open');
    if (!stillOpen) usePrivacyStore.getState().setP2P(link.channelId, state);
  }

  private peerUser(link: Link): User {
    const channel = useGuildStore.getState().channels[link.channelId];
    return (
      channel?.recipients?.find((u) => u.id === link.peerUserId) ?? { id: link.peerUserId, username: 'Unknown user', global_name: null, avatar: null }
    );
  }

  private selfUser(): User {
    const user = useSessionStore.getState().user;
    if (!user) throw new Error('Not signed in');
    return user;
  }

  private async requireCrypto(): Promise<CryptoBridge> {
    const crypto = this.deps.crypto;
    if (!crypto) throw encryptionUnavailable('the native crypto module is not present; P2P needs it to prove device identity');
    const status = await crypto.status();
    if (!status.available) throw encryptionUnavailable(status.reason);
    return crypto;
  }
}
