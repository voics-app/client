/** Typed surface of the napi-rs crypto module (see src/lib.rs). */

export interface AddMembersResult {
  commit: Buffer;
  welcome: Buffer;
  epoch: number;
}

export interface JoinResult {
  groupId: Buffer;
  epoch: number;
}

export interface EncryptResult {
  ciphertext: Buffer;
  epoch: number;
}

export interface IncomingResult {
  kind: 'application' | 'commit' | 'proposal' | 'ignored';
  plaintext?: Buffer;
  senderIdentity?: string;
  epoch?: number;
}

export interface RemoveMembersResult {
  commit: Buffer;
  epoch: number;
}

export interface StoredMessage {
  channelId: string;
  messageId: string;
  sortKey: number;
  json: string;
}

export declare function verify(publicKey: Buffer, message: Buffer, signature: Buffer): boolean;

export declare class NativeCrypto {
  static open(path: string, keyHex: string, credentialLabel: string): NativeCrypto;
  ensureIdentity(): Buffer;
  sign(data: Buffer): Buffer;
  generateKeyPackages(count: number): Buffer[];
  hasGroup(groupId: Buffer): boolean;
  createGroup(groupId: Buffer): number;
  addMembers(groupId: Buffer, keyPackages: Buffer[]): AddMembersResult;
  /** Identity (signature) public keys of every device currently in the group, own device included. */
  memberKeys(groupId: Buffer): Buffer[];
  /** Commits the removal of the devices owning `identityKeys`; null when none of them is a member. */
  removeMembers(groupId: Buffer, identityKeys: Buffer[]): RemoveMembersResult | null;
  joinFromWelcome(welcome: Buffer): JoinResult;
  encrypt(groupId: Buffer, plaintext: Buffer): EncryptResult;
  processIncoming(groupId: Buffer, message: Buffer): IncomingResult;
  exportSecret(groupId: Buffer, label: string, context: Buffer, length: number): Buffer;
  epoch(groupId: Buffer): number;
  putMessage(message: StoredMessage): void;
  listMessages(channelId: string, beforeSortKey: number | null, limit: number): StoredMessage[];
  deleteMessage(channelId: string, messageId: string): void;
}
