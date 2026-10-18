/**
 * Hosts the napi-rs crypto module in the main process and exposes it to the
 * renderer as the `CryptoBridge` over a single whitelisted IPC channel.
 * The store key is 256 random bits wrapped by the OS keychain.
 */
import { randomBytes } from 'node:crypto';
import type { CryptoBridge, CryptoMethod, CryptoStatus, LocalMessageRecord } from '../shared/ipc';
import { readSecret, userDataPath, writeSecret } from './persistence';

import type * as NativeModuleNs from '@discordy/crypto';

type NativeModule = typeof NativeModuleNs;
type NativeEngine = InstanceType<NativeModule['NativeCrypto']>;

const b64 = (buf: Buffer): string => buf.toString('base64');
const buf = (s: string): Buffer => Buffer.from(s, 'base64');
const groupKey = (groupId: string): Buffer => Buffer.from(groupId, 'utf8');

function loadNative(): { module: NativeModule | null; reason?: string } {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return { module: require('@discordy/crypto') as NativeModule };
  } catch (error) {
    return { module: null, reason: error instanceof Error ? error.message : String(error) };
  }
}

export class CryptoHost {
  private readonly native = loadNative();
  private engine: NativeEngine | null = null;

  private requireEngine(): NativeEngine {
    if (!this.engine) throw new Error('crypto store not initialised; sign in first');
    return this.engine;
  }

  private requireModule(): NativeModule {
    if (!this.native.module) throw new Error(`native crypto unavailable: ${this.native.reason ?? 'unknown'}`);
    return this.native.module;
  }

  private databaseKey(userId: string): string {
    const file = userDataPath('crypto', `${userId}.key`);
    const existing = readSecret(file);
    if (existing && existing.length === 32) return existing.toString('hex');
    const key = randomBytes(32);
    writeSecret(file, key);
    return key.toString('hex');
  }

  readonly api: CryptoBridge = {
    status: async (): Promise<CryptoStatus> =>
      this.native.module ? { available: true } : { available: false, reason: this.native.reason },
    initialise: async (userId, deviceLabel) => {
      if (!/^\d{1,20}$/.test(userId)) throw new Error('invalid user id');
      const nativeModule = this.requireModule();
      this.engine = nativeModule.NativeCrypto.open(
        userDataPath('crypto', `${userId}.db`),
        this.databaseKey(userId),
        `${userId}:${deviceLabel}`,
      );
      return b64(this.engine.ensureIdentity());
    },
    sign: async (data) => b64(this.requireEngine().sign(buf(data))),
    verify: async (publicKey, data, signature) => this.requireModule().verify(buf(publicKey), buf(data), buf(signature)),
    generateKeyPackages: async (count) => this.requireEngine().generateKeyPackages(Math.min(Math.max(count, 1), 100)).map(b64),
    hasGroup: async (groupId) => this.requireEngine().hasGroup(groupKey(groupId)),
    createGroup: async (groupId) => this.requireEngine().createGroup(groupKey(groupId)),
    addMembers: async (groupId, packages) => {
      const r = this.requireEngine().addMembers(groupKey(groupId), packages.map(buf));
      return { commitB64: b64(r.commit), welcomeB64: b64(r.welcome), epoch: r.epoch };
    },
    memberKeys: async (groupId) => this.requireEngine().memberKeys(groupKey(groupId)).map(b64),
    removeMembers: async (groupId, identityKeys) => {
      const r = this.requireEngine().removeMembers(groupKey(groupId), identityKeys.map(buf));
      return r ? { commitB64: b64(r.commit), epoch: r.epoch } : null;
    },
    joinFromWelcome: async (welcome) => {
      const r = this.requireEngine().joinFromWelcome(buf(welcome));
      return { groupId: r.groupId.toString('utf8'), epoch: r.epoch };
    },
    encrypt: async (groupId, plaintext) => {
      const r = this.requireEngine().encrypt(groupKey(groupId), buf(plaintext));
      return { ciphertextB64: b64(r.ciphertext), epoch: r.epoch };
    },
    processIncoming: async (groupId, message) => {
      const r = this.requireEngine().processIncoming(groupKey(groupId), buf(message));
      return {
        kind: r.kind,
        plaintextB64: r.plaintext ? b64(r.plaintext) : undefined,
        senderIdentity: r.senderIdentity,
        epoch: r.epoch,
      };
    },
    exportSecret: async (groupId, label, length) =>
      b64(this.requireEngine().exportSecret(groupKey(groupId), label, Buffer.alloc(0), Math.min(length, 64))),
    putMessage: async (record: LocalMessageRecord) => this.requireEngine().putMessage(record),
    listMessages: async (channelId, before, limit) => this.requireEngine().listMessages(channelId, before, Math.min(limit, 200)),
    deleteMessage: async (channelId, messageId) => this.requireEngine().deleteMessage(channelId, messageId),
  };

  invoke(method: string, args: unknown[]): Promise<unknown> {
    if (!Object.prototype.hasOwnProperty.call(this.api, method)) {
      return Promise.reject(new Error(`unknown crypto method ${method}`));
    }
    const fn = this.api[method as CryptoMethod] as (...a: unknown[]) => Promise<unknown>;
    return fn(...args);
  }
}
