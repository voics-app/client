import { vi } from 'vitest';
import type { Channel, User } from '@shared/contracts/rest';
import type { CryptoBridge, LocalMessageRecord } from '@shared/ipc';
import type { ApiPort } from '@renderer/application/ports/api';
import type { GatewayPort } from '@renderer/application/ports/gateway';
import type { DataChannelLike, PeerConnectionLike } from '@renderer/application/privacy/p2pService';
import { useGuildStore } from '@renderer/application/stores/guildStore';
import { useMessageStore } from '@renderer/application/stores/messageStore';
import { usePrivacyStore } from '@renderer/application/stores/privacyStore';
import { useSessionStore } from '@renderer/application/stores/sessionStore';

export const SELF = { userId: '1', deviceId: '10', identityKeyB64: 'key-self' };
export const BOB = { userId: '2', deviceId: '20', identityKeyB64: 'key-bob' };

export const selfUser: User = { id: '1', username: 'alice', global_name: 'Alice', avatar: null };
export const bobUser: User = { id: '2', username: 'bob', global_name: 'Bob', avatar: null };

export const dm = (mode: Channel['delivery_mode'] = 'ephemeral'): Channel => ({
  id: '500',
  type: 1,
  guild_id: null,
  recipients: [bobUser],
  delivery_mode: mode,
});

export function resetStores(channel: Channel = dm()): void {
  useMessageStore.getState().reset();
  usePrivacyStore.setState({ p2p: {}, groups: {}, watch: {}, serverOffsetMs: 0 });
  useGuildStore.getState().reset();
  useGuildStore.getState().upsertChannel(channel);
  useSessionStore.setState({ user: selfUser, deviceId: SELF.deviceId, settings: { default_delivery_mode: 'standard', delivery_overrides: {} } });
}

export class FakeGateway implements GatewayPort {
  state = 'ready' as const;
  sent: { op: number; d: unknown }[] = [];
  log: string[] = [];
  connect = vi.fn();
  disconnect = vi.fn();
  onDispatch = vi.fn(() => () => undefined);
  onState = vi.fn(() => () => undefined);
  onFatal = vi.fn(() => () => undefined);
  onOp = vi.fn(() => () => undefined);
  send(op: number, d: unknown): void {
    this.sent.push({ op, d });
    this.log.push(`gw:${op}`);
  }
  ofOp(op: number) {
    return this.sent.filter((f) => f.op === op).map((f) => f.d as Record<string, unknown>);
  }
}

const xor = (b64: string) => btoa([...atob(b64)].map((c) => String.fromCharCode(c.charCodeAt(0) ^ 0x5a)).join(''));

export function fakeCrypto(gateway?: FakeGateway, available = true) {
  const groups = new Set<string>();
  const records = new Map<string, LocalMessageRecord>();
  const crypto = {
    status: vi.fn(async () => (available ? { available: true } : { available: false, reason: 'native module missing' })),
    initialise: vi.fn(async () => 'key-self'),
    sign: vi.fn(async (data: string) => `sig:${data}`),
    verify: vi.fn(async (key: string, data: string, sig: string) => key === 'key-bob' && sig === `sig:${data}`),
    generateKeyPackages: vi.fn(async (n: number) => Array.from({ length: n }, (_, i) => `kp${i}`)),
    hasGroup: vi.fn(async (id: string) => groups.has(id)),
    deleteGroup: vi.fn(async (id: string) => groups.delete(id)),
    createGroup: vi.fn(async (id: string) => {
      groups.add(id);
      return 1;
    }),
    addMembers: vi.fn(async (_g: string, pkgs: string[]) => ({ commitB64: btoa(`commit:${pkgs.length}`), welcomeB64: btoa('welcome'), epoch: 2 })),
    memberKeys: vi.fn(async (): Promise<string[]> => []),
    removeMembers: vi.fn(async (): Promise<{ commitB64: string; epoch: number } | null> => null),
    joinFromWelcome: vi.fn(async () => {
      groups.add('500');
      return { groupId: '500', epoch: 3 };
    }),
    encrypt: vi.fn(async (_g: string, plaintextB64: string) => ({ ciphertextB64: xor(plaintextB64), epoch: 2 })),
    processIncoming: vi.fn(async (_g: string, messageB64: string) => ({ kind: 'application' as const, plaintextB64: xor(messageB64), epoch: 2 })),
    exportSecret: vi.fn(async () => ''),
    putMessage: vi.fn(async (r: LocalMessageRecord) => {
      gateway?.log.push('persist');
      records.set(`${r.channelId}/${r.messageId}`, r);
    }),
    listMessages: vi.fn(async (channelId: string) => [...records.values()].filter((r) => r.channelId === channelId).sort((a, b) => b.sortKey - a.sortKey)),
    deleteMessage: vi.fn(async () => undefined),
  } satisfies CryptoBridge;
  return { crypto, groups, records, encryptFake: xor };
}

export function fakeApi(devices: Record<string, { device_id: string; identity_key_b64: string }[]>) {
  const api = {
    listUserDevices: vi.fn(async (userId: string) => devices[userId] ?? []),
    claimKeyPackage: vi.fn(async (userId: string, deviceId: string) => ({ package_b64: `pkg:${userId}:${deviceId}` })),
    uploadKeyPackages: vi.fn(async () => undefined),
    sendMessage: vi.fn(),
    editMessage: vi.fn(),
    deleteMessage: vi.fn(),
    channel: vi.fn(),
    updateChannel: vi.fn(),
    setChannelDeliveryOverride: vi.fn(async () => undefined),
    updateSettings: vi.fn(),
    messages: vi.fn(async (): Promise<unknown[]> => []),
    createAttachmentSlots: vi.fn(),
    refreshAttachmentUrls: vi.fn(async (_c: string, urls: string[]) => ({
      refreshed_urls: urls.map((original) => ({ original, refreshed: `https://cdn.test/attachments/signed/${original}?ex=ff&is=1&hm=00` })),
    })),
    upload: vi.fn(),
  };
  return api;
}

export const asApi = (api: object) => api as unknown as ApiPort;

export class FakeDataChannel implements DataChannelLike {
  readyState = 'connecting';
  bufferedAmount = 0;
  bufferedAmountLowThreshold = 0;
  binaryType = 'blob';
  /** When true, binary sends stay buffered until flush() is called (models a slow link). */
  holdBuffer = false;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onbufferedamountlow: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  sent: string[] = [];
  binary: Uint8Array[] = [];
  send(data: string | ArrayBuffer) {
    if (typeof data === 'string') {
      this.sent.push(data);
      return;
    }
    this.binary.push(new Uint8Array(data.slice(0)));
    if (this.holdBuffer) this.bufferedAmount += data.byteLength;
  }
  flush() {
    this.bufferedAmount = 0;
    this.onbufferedamountlow?.();
  }
  close() {
    this.readyState = 'closed';
  }
  open() {
    this.readyState = 'open';
    this.onopen?.();
  }
}

export const SDP = (fingerprint = 'sha-256 AA:BB') => `v=0\r\na=fingerprint:${fingerprint}\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n`;

export class FakePeerConnection implements PeerConnectionLike {
  localDescription: { type: string; sdp?: string } | null = null;
  connectionState = 'new';
  onicecandidate: PeerConnectionLike['onicecandidate'] = null;
  ondatachannel: PeerConnectionLike['ondatachannel'] = null;
  onconnectionstatechange: (() => void) | null = null;
  channel = new FakeDataChannel();
  remote: { type: string; sdp?: string } | null = null;
  candidates: unknown[] = [];
  closed = false;
  constructor(private readonly fingerprint = 'sha-256 AA:BB') {}
  createDataChannel() {
    return this.channel;
  }
  async createOffer() {
    return { type: 'offer', sdp: SDP(this.fingerprint) };
  }
  async createAnswer() {
    return { type: 'answer', sdp: SDP(this.fingerprint) };
  }
  async setLocalDescription(d: { type: string; sdp?: string }) {
    this.localDescription = d;
  }
  async setRemoteDescription(d: { type: string; sdp?: string }) {
    this.remote = d;
  }
  async addIceCandidate(c: unknown) {
    this.candidates.push(c);
  }
  close() {
    this.closed = true;
  }
}

export const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
