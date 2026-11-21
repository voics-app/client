/**
 * The mobile `CryptoBridge`: the Expo module `VoicsCrypto` (Swift over the Rust engine, modules/voics-crypto)
 * adapted to the port that @discordy/core's private messaging services take. The module already speaks base64
 * and enforces the same limits as desktop, so this only reshapes arguments and results.
 */
import type { CryptoBridge, IncomingMlsResult, LocalMessageRecord } from '@discordy/core/application/ports/crypto';

/** What the Swift module exposes; mirrors modules/voics-crypto/ios/VoicsCryptoModule.swift one to one. */
export interface VoicsCryptoNative {
  isAvailable?(): boolean;
  readAttachment?(uri: string): Promise<string>;
  encryptAttachment?(plaintext: string): Promise<{ ciphertext: string; key_b64: string; nonce_b64: string; sha256_b64: string }>;
  decryptAttachment?(ciphertext: string, key: string, nonce: string, hash: string, size: number): Promise<string>;
  uploadAttachment?(url: string, ciphertext: string): Promise<void>;
  downloadAttachment?(url: string): Promise<string>;
  storeAttachment?(id: string, plaintext: string): Promise<string>;
  removeAttachment?(id: string): Promise<void>;
  initialise(userId: string, deviceLabel: string): Promise<string>;
  sign(dataB64: string): Promise<string>;
  verify(publicKeyB64: string, dataB64: string, signatureB64: string): Promise<boolean>;
  generateKeyPackages(count: number): Promise<string[]>;
  hasGroup(groupId: string): Promise<boolean>;
  deleteGroup(groupId: string): Promise<boolean>;
  createGroup(groupId: string): Promise<number>;
  addMembers(groupId: string, keyPackagesB64: string[]): Promise<{ commitB64: string; welcomeB64: string; epoch: number }>;
  memberKeys(groupId: string): Promise<string[]>;
  removeMembers(groupId: string, identityKeysB64: string[]): Promise<{ commitB64: string; epoch: number } | null>;
  joinFromWelcome(welcomeB64: string): Promise<{ groupId: string; epoch: number }>;
  encrypt(groupId: string, plaintextB64: string): Promise<{ ciphertextB64: string; epoch: number }>;
  processIncoming(groupId: string, messageB64: string): Promise<IncomingMlsResult>;
  exportSecret(groupId: string, label: string, length: number): Promise<string>;
  putMessage(channelId: string, messageId: string, sortKey: number, json: string): Promise<void>;
  listMessages(channelId: string, beforeSortKey: number | null, limit: number): Promise<LocalMessageRecord[]>;
  deleteMessage(channelId: string, messageId: string): Promise<void>;
}

export function createMobileCryptoBridge(native: VoicsCryptoNative): CryptoBridge {
  return {
    status: async () => ({ available: true }),
    initialise: (userId, deviceLabel) => native.initialise(userId, deviceLabel),
    sign: (data) => native.sign(data),
    verify: (publicKey, data, signature) => native.verify(publicKey, data, signature),
    generateKeyPackages: (count) => native.generateKeyPackages(count),
    hasGroup: (groupId) => native.hasGroup(groupId),
    deleteGroup: (groupId) => native.deleteGroup(groupId),
    createGroup: (groupId) => native.createGroup(groupId),
    addMembers: (groupId, packages) => native.addMembers(groupId, packages),
    memberKeys: (groupId) => native.memberKeys(groupId),
    removeMembers: (groupId, keys) => native.removeMembers(groupId, keys),
    joinFromWelcome: (welcome) => native.joinFromWelcome(welcome),
    encrypt: (groupId, plaintext) => native.encrypt(groupId, plaintext),
    processIncoming: (groupId, message) => native.processIncoming(groupId, message),
    exportSecret: (groupId, label, length) => native.exportSecret(groupId, label, length),
    putMessage: (record) => native.putMessage(record.channelId, record.messageId, record.sortKey, record.json),
    listMessages: (channelId, before, limit) => native.listMessages(channelId, before, limit),
    deleteMessage: (channelId, messageId) => native.deleteMessage(channelId, messageId),
  };
}
