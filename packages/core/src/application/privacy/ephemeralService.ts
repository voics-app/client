/**
 * Ephemeral E2EE delivery: one MLS group per channel (group id = channel id),
 * ciphertext relayed over gateway op 20 and deleted server-side on op 21 ACK.
 * There is deliberately no plaintext or "fake encryption" fallback: when the
 * native crypto module is unavailable every send fails loudly.
 */
import { privacyDebug } from './debugLog';
import type { Channel, User } from '../../contracts/rest';
import { GatewayOp, type E2EEContentType, type E2EEEnvelope, type E2EERecipient } from '../../contracts/gateway';
import type { CryptoBridge } from '../ports/crypto';
import type { ApiPort } from '../ports/api';
import type { GatewayPort } from '../ports/gateway';
import { useGuildStore } from '../stores/guildStore';
import { useMessageStore, type ChatMessage } from '../stores/messageStore';
import { usePrivacyStore } from '../stores/privacyStore';
import { useSessionStore } from '../stores/sessionStore';
import type { DeviceDirectory} from './deviceDirectory';
import { participantsOf } from './deviceDirectory';
import { removeStaleDevices, type Membership } from './groupRemoval';
import type { AttachmentService } from './attachmentService';
import type { LocalHistory } from './localHistory';
import { decodeControl, encodeControl, type PrivateControl } from './control';
import { PrivateRetention } from './retention';
import {
  PrivateDeliveryError,
  buildPrivateMessage,
  decodePayload,
  encodePayload,
  encryptionUnavailable,
  generateLocalId,
  ttlField,
  type PrivatePayload,
  type SelfIdentity,
  type SendInput,
} from './types';

export const KEY_PACKAGE_BATCH = 30;
export const KEY_PACKAGE_REFILL = 10;
const KEY_PACKAGE_REFILL_AFTER_CLAIMS = 10;
const KEY_PACKAGE_MAX_AGE_MS = 24 * 3_600_000;

export interface EphemeralDeps {
  gateway: Pick<GatewayPort, 'send'>;
  api: Pick<ApiPort, 'uploadKeyPackages' | 'claimKeyPackage' | 'listUserDevices'>;
  crypto: CryptoBridge | undefined;
  devices: DeviceDirectory;
  history: LocalHistory;
  attachments: Pick<AttachmentService, 'prepareCdn'>;
  /** Shared with the P2P service; created from `history` when omitted. */
  retention?: PrivateRetention;
  getSelf: () => SelfIdentity;
  now: () => number;
  /** A decrypted incoming message was shown: feeds unread/mention counters and notifications. */
  onIncoming?: (message: ChatMessage) => void;
}

interface KeyPackageMeta {
  /** Device row the packages were uploaded for; a fresh sign-in registers a new row that has none yet. */
  deviceId?: string;
  uploadedAt: number;
  claimsSinceUpload: number;
}

export class EphemeralService {
  private chain: Promise<unknown> = Promise.resolve();
  /** Envelopes for a group this device has not joined yet, replayed once its welcome is applied. */
  private readonly awaitingWelcome = new Map<string, E2EEEnvelope[]>();
  private cryptoChecked = false;
  /** Messages sent in a group before any peer has spoken in it; re-sent if that group is replaced (split brain). */
  private readonly unconfirmed = new Map<string, { id: string; plaintextB64: string }[]>();

  private readonly retention: PrivateRetention;

  constructor(private readonly deps: EphemeralDeps) {
    this.retention = deps.retention ?? new PrivateRetention(deps.history, deps.now);
  }

  /** Opens the encrypted store and returns this device's identity public key (base64). */
  async initialiseIdentity(deviceLabel: string): Promise<string> {
    const crypto = await this.requireCrypto();
    return crypto.initialise(this.deps.getSelf().userId, deviceLabel);
  }

  /** Uploads key packages when none were published recently. Safe to call after every READY. */
  async start(): Promise<void> {
    if (!this.deps.crypto || !(await this.deps.crypto.status()).available) return;
    const meta = await this.deps.history.getState<KeyPackageMeta>('keypackages');
    const stale = !meta || meta.deviceId !== this.deps.getSelf().deviceId || this.deps.now() - meta.uploadedAt > KEY_PACKAGE_MAX_AGE_MS;
    if (stale) await this.uploadKeyPackages(KEY_PACKAGE_BATCH);
  }

  stop(): void {
    this.cryptoChecked = false;
    this.deps.devices.invalidate();
  }

  /** Encrypts and relays a message to every other device in the channel's MLS group. */
  send(channel: Channel, input: SendInput): Promise<ChatMessage> {
    return this.enqueue(() => this.sendNow(channel, input));
  }

  /** Deletes your own message for everyone in the chat: relays a control message, then removes it here. */
  deleteForEveryone(channel: Channel, messageId: string): Promise<void> {
    return this.enqueue(async () => {
      const message = useMessageStore.getState().timelines[channel.id]?.byId[messageId];
      if (message && message.author.id !== this.deps.getSelf().userId) {
        throw new PrivateDeliveryError('unsupported', 'Only the author can delete a message for everyone.');
      }
      await this.sendControl(channel, { kind: 'delete', messageId });
      await this.retention.removeMessage(channel.id, messageId);
    });
  }

  /** Tells the other devices of the chat which disappearing-message timer is on; the local timer is set by the caller. */
  announceTimer(channel: Channel, ttlMs: number | null): Promise<void> {
    return this.enqueue(() => this.sendControl(channel, { kind: 'timer', ttlMs }));
  }

  /** Handles one E2EE_ENVELOPE addressed to this device (gateway→client carries only our entry). */
  handleEnvelope(envelope: E2EEEnvelope): Promise<void> {
    return this.enqueue(() => this.receiveNow(envelope));
  }

  /**
   * Re-checks the MLS group of a channel against its current participants and devices, and commits
   * the removal of devices that no longer belong. `attempt` > 0 is a retry after a lost commit race.
   */
  reconcileMembership(channelId: string, attempt = 0): Promise<void> {
    return this.enqueue(() => this.reconcileNow(channelId, attempt));
  }

  /**
   * A member was added to an existing group DM: commits an MLS Add for their devices and relays the
   * commit and welcome now, instead of at the next send. Only the adding client calls this, so there
   * is no commit race; a channel without an MLS group yet is left alone (its first send creates it).
   */
  syncMembership(channelId: string): Promise<void> {
    return this.enqueue(async () => {
      const crypto = await this.requireCrypto();
      const channel = useGuildStore.getState().channels[channelId];
      if (!channel || !(await crypto.hasGroup(channelId))) return;
      await this.ensureMembership(channel, crypto);
    });
  }

  /** Reconciles every channel that has an MLS group, optionally limited to one guild. */
  async reconcileAll(guildId?: string): Promise<void> {
    const crypto = this.deps.crypto;
    if (!crypto || !(await crypto.status()).available) return;
    for (const channel of Object.values(useGuildStore.getState().channels)) {
      if (guildId !== undefined && channel.guild_id !== guildId) continue;
      if (!(await crypto.hasGroup(channel.id))) continue;
      await this.reconcileMembership(channel.id).catch(() => undefined);
    }
  }

  // ---- sending -----------------------------------------------------------------

  private async sendNow(channel: Channel, input: SendInput): Promise<ChatMessage> {
    privacyDebug('ephemeral send: start', { channel: channel.id });
    const crypto = await this.requireCrypto();
    privacyDebug('ephemeral send: crypto ready');
    const self = this.deps.getSelf();
    const author = this.selfUser();
    const channelId = channel.id;

    const membership = await this.ensureMembership(channel, crypto);
    const recipients = this.recipientsOf(membership, self.deviceId);
    privacyDebug('ephemeral send: membership', { devices: Object.keys(membership).length, recipients: recipients.length });
    if (recipients.length === 0) {
      throw new PrivateDeliveryError('no_recipients', 'None of the other participants has a device that can receive encrypted messages yet.');
    }

    const id = generateLocalId(this.deps.now());
    const attached = input.files && input.files.length > 0 ? await this.deps.attachments.prepareCdn(channelId, input.files, id) : [];
    const payload: PrivatePayload = {
      v: 1,
      content: input.content,
      nonce: id,
      timestamp: new Date(this.deps.now()).toISOString(),
      reply_to: input.replyTo ?? null,
      files: attached.map((a, i) => ({ ...a.private, ...(i === 0 && input.voice ? { voice: input.voice } : {}) })),
      ...ttlField(this.retention.ttlOf(channelId)),
    };
    const plaintextB64 = encodePayload(payload);
    const { ciphertextB64, epoch } = await crypto.encrypt(channelId, plaintextB64);
    this.unconfirmed.set(channelId, [...(this.unconfirmed.get(channelId) ?? []).slice(-19), { id, plaintextB64 }]);
    privacyDebug('ephemeral send: encrypted, relaying', { epoch });
    this.relay(channelId, id, 'application', epoch, recipients.map((r) => ({ ...r, ciphertext_b64: ciphertextB64 })));

    const message = buildPrivateMessage({ id, channel, author, payload, mode: 'ephemeral', expiresAt: this.retention.expiryFor(payload.ttl_ms) });
    await this.deps.history.save(message);
    useMessageStore.getState().receive(message);
    usePrivacyStore.getState().setGroup(channelId, 'ready', epoch);
    return message;
  }

  private async sendControl(channel: Channel, control: PrivateControl): Promise<void> {
    const crypto = await this.requireCrypto();
    const membership = await this.ensureMembership(channel, crypto);
    const recipients = this.recipientsOf(membership, this.deps.getSelf().deviceId);
    if (recipients.length === 0) return;
    const id = generateLocalId(this.deps.now());
    const plaintextB64 = encodeControl(control);
    const { ciphertextB64, epoch } = await crypto.encrypt(channel.id, plaintextB64);
    this.unconfirmed.set(channel.id, [...(this.unconfirmed.get(channel.id) ?? []).slice(-19), { id, plaintextB64 }]);
    this.relay(channel.id, id, 'application', epoch, recipients.map((r) => ({ ...r, ciphertext_b64: ciphertextB64 })));
  }

  private relay(channelId: string, messageId: string, contentType: E2EEContentType, epoch: number, recipients: E2EERecipient[]): void {
    const envelope: E2EEEnvelope = {
      channel_id: channelId,
      message_id: messageId,
      sender_device_id: this.deps.getSelf().deviceId,
      recipients,
      mls_epoch: epoch,
      content_type: contentType,
    };
    this.deps.gateway.send(GatewayOp.E2EE_ENVELOPE, envelope);
  }

  private recipientsOf(membership: Membership, selfDeviceId: string): { user_id: string; device_id: string }[] {
    return Object.entries(membership)
      .filter(([deviceId]) => deviceId !== selfDeviceId)
      .map(([device_id, user_id]) => ({ user_id, device_id }));
  }

  // ---- group lifecycle -----------------------------------------------------------

  /** Creates the group when absent and adds every participant device not yet in it. */
  private async ensureMembership(channel: Channel, crypto: CryptoBridge): Promise<Membership> {
    const self = this.deps.getSelf();
    const channelId = channel.id;
    const privacy = usePrivacyStore.getState();
    let membership = await this.deps.history.getState<Membership>(`mls-members:${channelId}`);

    if (!(await crypto.hasGroup(channelId))) {
      privacyDebug('ephemeral: creating group', { channel: channelId });
      privacy.setGroup(channelId, 'establishing');
      const epoch = await crypto.createGroup(channelId);
      membership = { [self.deviceId]: self.userId };
      privacy.setGroup(channelId, 'establishing', epoch);
    } else if (!membership) {
      // Joined through a welcome (or the member list was lost): assume current devices are already members.
      membership = await this.currentDevices(channelId);
    }

    try {
      membership = await this.dropRemovedDevices(channelId, crypto, membership, { force: true });
      membership = await this.addMissingDevices(channelId, crypto, membership);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      privacy.setGroup(channelId, 'error', undefined, detail);
      throw error;
    }
    await this.deps.history.putState(`mls-members:${channelId}`, membership);
    return membership;
  }

  /** Commits the removal of group devices that are no longer participants and relays the commit. */
  private async dropRemovedDevices(
    channelId: string,
    crypto: CryptoBridge,
    membership: Membership,
    options: { attempt?: number; force?: boolean },
  ): Promise<Membership> {
    const deps = { crypto, devices: this.deps.devices, self: this.deps.getSelf() };
    const { membership: next, commit } = await removeStaleDevices(deps, channelId, membership, options);
    if (commit) {
      if (commit.recipients.length > 0) {
        const recipients = commit.recipients.map((r) => ({ ...r, ciphertext_b64: commit.commitB64 }));
        this.relay(channelId, generateLocalId(this.deps.now()), 'commit', commit.epoch, recipients);
      }
      usePrivacyStore.getState().setGroup(channelId, 'ready', commit.epoch);
    }
    return next;
  }

  private async reconcileNow(channelId: string, attempt: number): Promise<void> {
    const crypto = await this.requireCrypto();
    if (!(await crypto.hasGroup(channelId))) return;
    const key = `mls-members:${channelId}`;
    const stored = (await this.deps.history.getState<Membership>(key)) ?? {};
    try {
      await this.deps.history.putState(key, await this.dropRemovedDevices(channelId, crypto, stored, { attempt }));
    } catch (error) {
      usePrivacyStore.getState().setGroup(channelId, 'error', undefined, error instanceof Error ? error.message : String(error));
    }
  }

  /** After a commit was applied: notice our own removal, otherwise prune and follow up on pending removals. */
  private async afterCommit(channelId: string, crypto: CryptoBridge): Promise<void> {
    const keys = await crypto.memberKeys(channelId);
    if (!keys.includes(this.deps.getSelf().identityKeyB64)) {
      await this.deps.history.putState(`mls-members:${channelId}`, {});
      usePrivacyStore.getState().setGroup(channelId, 'error', undefined, 'This device was removed from the encrypted conversation.');
      return;
    }
    await this.reconcileNow(channelId, 0);
  }

  private async currentDevices(channelId: string): Promise<Membership> {
    const self = this.deps.getSelf();
    const result: Membership = {};
    for (const userId of participantsOf(channelId, self.userId)) {
      for (const device of await this.deps.devices.devices(userId)) result[device.device_id] = userId;
    }
    result[self.deviceId] = self.userId;
    return result;
  }

  /**
   * Devices to add: one group of device rows per identity key. A device keeps one identity key across
   * sign-ins while every sign-in registers a new device row, so several rows can share a signature key
   * and OpenMLS rejects a commit adding them all (DuplicateSignatureKey). Keys already in the group and
   * the local key are skipped; rows of a key already in the group are returned as aliases.
   * Rows of one key are listed newest first.
   */
  private async devicesToAdd(
    channelId: string,
    crypto: CryptoBridge,
    membership: Membership,
  ): Promise<{ missing: { userId: string; rows: string[] }[]; aliases: Membership }> {
    const self = this.deps.getSelf();
    const inGroup = new Set(await crypto.memberKeys(channelId));
    inGroup.add(self.identityKeyB64);
    const byKey = new Map<string, { userId: string; rows: string[] }>();
    const aliases: Membership = {};
    for (const userId of participantsOf(channelId, self.userId)) {
      const devices = [...(await this.deps.devices.devices(userId))].sort((a, b) => (BigInt(b.device_id) > BigInt(a.device_id) ? 1 : -1));
      for (const device of devices) {
        if (device.device_id === self.deviceId || device.device_id in membership) continue;
        if (inGroup.has(device.identity_key_b64)) {
          aliases[device.device_id] = userId;
          continue;
        }
        const entry = byKey.get(device.identity_key_b64) ?? { userId, rows: [] };
        entry.rows.push(device.device_id);
        byKey.set(device.identity_key_b64, entry);
      }
    }
    return { missing: [...byKey.values()], aliases };
  }

  private async addMissingDevices(channelId: string, crypto: CryptoBridge, membership: Membership): Promise<Membership> {
    const { missing, aliases } = await this.devicesToAdd(channelId, crypto, membership);
    if (missing.length === 0) return { ...membership, ...aliases };

    privacyDebug('ephemeral: claiming key packages', { missing: missing.length });
    const claimed: { deviceId: string; userId: string; packageB64: string; rows: string[] }[] = [];
    for (const { userId, rows } of missing) {
      // Any row of the device can supply the package (they share one engine); try the newest first.
      for (const deviceId of rows) {
        try {
          const { package_b64 } = await this.deps.api.claimKeyPackage(userId, deviceId);
          claimed.push({ deviceId, userId, packageB64: package_b64, rows });
          break;
        } catch {
          // This row has no published key packages; try its siblings, else retry on the next send.
        }
      }
    }
    privacyDebug('ephemeral: claimed key packages', { claimed: claimed.length });
    if (claimed.length === 0) return { ...membership, ...aliases };

    const existingRecipients = this.recipientsOf(membership, this.deps.getSelf().deviceId);
    const { commitB64, welcomeB64, epoch } = await crypto.addMembers(
      channelId,
      claimed.map((c) => c.packageB64),
    );
    const id = () => generateLocalId(this.deps.now());
    if (existingRecipients.length > 0) {
      this.relay(channelId, id(), 'commit', epoch, existingRecipients.map((r) => ({ ...r, ciphertext_b64: commitB64 })));
    }
    this.relay(
      channelId,
      id(),
      'welcome',
      epoch,
      claimed.flatMap((c) => c.rows.map((row) => ({ user_id: c.userId, device_id: row, ciphertext_b64: welcomeB64 }))),
    );
    usePrivacyStore.getState().setGroup(channelId, 'ready', epoch);
    return { ...membership, ...aliases, ...Object.fromEntries(claimed.flatMap((c) => c.rows.map((row) => [row, c.userId]))) };
  }

  // ---- receiving -----------------------------------------------------------------

  private async receiveNow(envelope: E2EEEnvelope): Promise<void> {
    const self = this.deps.getSelf();
    privacyDebug('ephemeral receive', { type: envelope.content_type, channel: envelope.channel_id, forMe: envelope.recipients.some((r) => r.device_id === self.deviceId) });
    const entry = envelope.recipients.find((r) => r.device_id === self.deviceId) ?? envelope.recipients[0];
    if (!entry || envelope.sender_device_id === self.deviceId) {
      this.ack(envelope);
      return;
    }
    const channelId = envelope.channel_id;
    const privacy = usePrivacyStore.getState();
    try {
      const crypto = await this.requireCrypto();
      if (envelope.content_type === 'welcome') {
        await this.handleWelcome(crypto, envelope, entry);
      } else {
        const result = await crypto.processIncoming(channelId, entry.ciphertext_b64);
        if (result.kind === 'application' && result.plaintextB64) {
          const accepted = await this.acceptApplication(envelope, result.plaintextB64);
          if (!accepted) privacy.setGroup(channelId, 'error', result.epoch, 'Dropped a message from an unknown device.');
        }
        if (result.epoch !== undefined) privacy.setGroup(channelId, 'ready', result.epoch);
        if (result.kind === 'commit') await this.afterCommit(channelId, crypto);
      }
      this.ack(envelope);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      if (envelope.content_type !== 'welcome' && /unknown MLS group/i.test(reason)) {
        // The welcome that adds this device can arrive after the group's first messages; keep them
        // (unacknowledged) until it does.
        privacyDebug('ephemeral receive: waiting for welcome', { channel: channelId });
        this.awaitingWelcome.set(channelId, [...(this.awaitingWelcome.get(channelId) ?? []), envelope]);
        privacy.setGroup(channelId, 'establishing');
        return;
      }
      if (envelope.content_type === 'application' && /WrongEpoch|AeadError/i.test(reason)) {
        // Encrypted in a group this device no longer holds (it lost a split-brain tie-break); it can never
        // be read, and keeping it unacknowledged would only make the gateway redeliver it forever.
        privacyDebug('ephemeral receive: dropping an unreadable message from a superseded group', { channel: channelId });
        this.ack(envelope);
        return;
      }
      if (envelope.content_type === 'commit' && /epoch/i.test(reason)) {
        // Lost a commit race: the lowest epoch wins, so this stale commit can never apply. Drop it and
        // retry any removal that is still pending as the next committer in line.
        this.ack(envelope);
        await this.reconcileNow(channelId, 1);
        return;
      }
      // Not acknowledged: the gateway keeps the entry (7 day TTL) so it can be retried once the cause is fixed.
      privacy.setGroup(channelId, 'error', undefined, error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * True when a Welcome for a group we already hold should replace our copy. Two devices can each create
   * the group for a channel (one sent before the peer had a device, or both sent first at the same time),
   * and a device cannot join a group id it already holds. A group with no one else in it is always
   * replaced; otherwise the group created by the lower identity key wins, which both sides compute alike.
   */
  private async welcomeSupersedes(crypto: CryptoBridge, envelope: E2EEEnvelope): Promise<boolean> {
    const keys = await crypto.memberKeys(envelope.channel_id);
    if (keys.length <= 1) return true;
    const self = this.deps.getSelf();
    const owner = await this.deps.devices.ownerOf(participantsOf(envelope.channel_id, self.userId), envelope.sender_device_id);
    const senderKey = owner ? await this.deps.devices.identityKey(owner, envelope.sender_device_id) : null;
    return senderKey !== null && senderKey < self.identityKeyB64;
  }

  private async handleWelcome(crypto: CryptoBridge, envelope: E2EEEnvelope, entry: E2EERecipient): Promise<void> {
    if (await crypto.hasGroup(envelope.channel_id)) {
      if (!(await this.welcomeSupersedes(crypto, envelope))) {
        privacyDebug('ephemeral welcome: keeping our group (lower identity key wins)', { channel: envelope.channel_id });
        return;
      }
      privacyDebug('ephemeral welcome: replacing our local group', { channel: envelope.channel_id });
      await crypto.deleteGroup(envelope.channel_id);
    }
    const { groupId, epoch } = await crypto.joinFromWelcome(entry.ciphertext_b64);
    usePrivacyStore.getState().setGroup(groupId, 'ready', epoch);
    const waiting = this.awaitingWelcome.get(groupId) ?? [];
    this.awaitingWelcome.delete(groupId);
    for (const parked of waiting) void this.enqueue(() => this.receiveNow(parked));
    const members = await this.currentDevices(groupId).catch(() => ({}) as Membership);
    await this.deps.history.putState(`mls-members:${groupId}`, members);
    await this.resendUnconfirmed(crypto, groupId, members);
    await this.noteKeyPackageClaimed();
  }

  /** Messages this device sent into a group it has just replaced were never readable by the peer: send them again. */
  private async resendUnconfirmed(crypto: CryptoBridge, channelId: string, membership: Membership): Promise<void> {
    const pending = this.unconfirmed.get(channelId) ?? [];
    this.unconfirmed.delete(channelId);
    const recipients = this.recipientsOf(membership, this.deps.getSelf().deviceId);
    if (pending.length === 0 || recipients.length === 0) return;
    for (const { id, plaintextB64 } of pending) {
      const { ciphertextB64, epoch } = await crypto.encrypt(channelId, plaintextB64);
      this.relay(channelId, id, 'application', epoch, recipients.map((r) => ({ ...r, ciphertext_b64: ciphertextB64 })));
    }
  }

  /** Decrypts, persists locally, shows, and only then lets the caller acknowledge. */
  private async acceptApplication(envelope: E2EEEnvelope, plaintextB64: string): Promise<boolean> {
    const self = this.deps.getSelf();
    const channelId = envelope.channel_id;
    // Includes our own user: another device of ours is a legitimate sender (multi-device mirroring).
    const senderUserId = await this.deps.devices.ownerOf(participantsOf(channelId, self.userId), envelope.sender_device_id);
    if (!senderUserId) return false;
    const control = decodeControl(plaintextB64);
    if (control) {
      await this.applyControl(channelId, senderUserId, control);
      return true;
    }
    const payload = decodePayload(plaintextB64, { channelId, mode: 'ephemeral', messageId: envelope.message_id });
    if (await this.retention.wasDeleted(channelId, envelope.message_id, senderUserId)) return true;

    const channel = useGuildStore.getState().channels[channelId] ?? { id: channelId, guild_id: null };
    const author = this.userById(senderUserId, channelId);
    const existing = useMessageStore.getState().timelines[channelId]?.byId[envelope.message_id];
    const message = buildPrivateMessage({ id: envelope.message_id, channel, author, payload, mode: 'ephemeral', expiresAt: this.retention.expiryFor(payload.ttl_ms) });
    if (senderUserId !== self.userId || envelope.sender_device_id !== self.deviceId) this.unconfirmed.delete(channelId);
    await this.deps.history.save(message);
    if (!existing) {
      useMessageStore.getState().receive(message);
      this.touchChannel(channelId, message.id);
      this.deps.onIncoming?.(message);
    }
    return true;
  }

  private async applyControl(channelId: string, senderUserId: string, control: PrivateControl): Promise<void> {
    if (control.kind === 'delete') await this.retention.applyDelete(channelId, senderUserId, control.messageId);
    else await this.retention.setTimer(channelId, control.ttlMs);
  }

  private touchChannel(channelId: string, messageId: string): void {
    const guilds = useGuildStore.getState();
    const channel = guilds.channels[channelId];
    if (channel) guilds.upsertChannel({ ...channel, last_message_id: messageId });
  }

  private ack(envelope: E2EEEnvelope): void {
    this.deps.gateway.send(GatewayOp.E2EE_ACK, { message_ids: [envelope.message_id] });
  }

  // ---- key packages ----------------------------------------------------------------

  private async noteKeyPackageClaimed(): Promise<void> {
    // Welcomes mean someone consumed one of our key packages; top up before the pool runs dry.
    const meta = (await this.deps.history.getState<KeyPackageMeta>('keypackages')) ?? { uploadedAt: 0, claimsSinceUpload: 0 };
    const claims = meta.claimsSinceUpload + 1;
    if (claims >= KEY_PACKAGE_REFILL_AFTER_CLAIMS) await this.uploadKeyPackages(KEY_PACKAGE_REFILL);
    else await this.deps.history.putState('keypackages', { ...meta, claimsSinceUpload: claims });
  }

  private async uploadKeyPackages(count: number): Promise<void> {
    const crypto = await this.requireCrypto();
    const packages = await crypto.generateKeyPackages(count);
    await this.deps.api.uploadKeyPackages(this.deps.getSelf().deviceId, packages);
    await this.deps.history.putState('keypackages', { deviceId: this.deps.getSelf().deviceId, uploadedAt: this.deps.now(), claimsSinceUpload: 0 } satisfies KeyPackageMeta);
  }

  // ---- helpers -----------------------------------------------------------------------

  private async requireCrypto(): Promise<CryptoBridge> {
    const crypto = this.deps.crypto;
    if (!crypto) throw encryptionUnavailable('the native crypto module is not present');
    if (!this.cryptoChecked) {
      const status = await crypto.status();
      if (!status.available) throw encryptionUnavailable(status.reason);
      this.cryptoChecked = true;
    }
    return crypto;
  }

  private selfUser(): User {
    const user = useSessionStore.getState().user;
    if (!user) throw new Error('Not signed in');
    return user;
  }

  private userById(userId: string, channelId: string): User {
    const channel = useGuildStore.getState().channels[channelId];
    const fromChannel = channel?.recipients?.find((u) => u.id === userId);
    if (fromChannel) return fromChannel;
    const guildMember = channel?.guild_id ? useGuildStore.getState().members[channel.guild_id]?.[userId] : undefined;
    return guildMember?.user ?? { id: userId, username: 'Unknown user', global_name: null, avatar: null };
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.chain.then(task);
    this.chain = run.catch(() => undefined);
    return run;
  }
}
