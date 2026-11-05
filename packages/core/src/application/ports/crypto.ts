/** The native MLS and encrypted-store engine behind Ephemeral and P2P modes. Desktop reaches it over IPC (napi), mobile through an Expo module (uniffi). Binary values travel as base64 strings. */

export interface CryptoStatus {
  available: boolean;
  reason?: string;
}

export interface IncomingMlsResult {
  kind: 'application' | 'commit' | 'proposal' | 'ignored';
  plaintextB64?: string;
  senderIdentity?: string;
  epoch?: number;
}

export interface LocalMessageRecord {
  channelId: string;
  messageId: string;
  sortKey: number;
  json: string;
}

export interface CryptoBridge {
  status(): Promise<CryptoStatus>;
  /** Opens the per-user encrypted store and returns the device identity public key (base64). */
  initialise(userId: string, deviceLabel: string): Promise<string>;
  sign(dataB64: string): Promise<string>;
  verify(publicKeyB64: string, dataB64: string, signatureB64: string): Promise<boolean>;
  generateKeyPackages(count: number): Promise<string[]>;
  hasGroup(groupId: string): Promise<boolean>;
  /** Forgets a local MLS group; resolves false when there was none. */
  deleteGroup(groupId: string): Promise<boolean>;
  createGroup(groupId: string): Promise<number>;
  addMembers(groupId: string, keyPackagesB64: string[]): Promise<{ commitB64: string; welcomeB64: string; epoch: number }>;
  /** Identity public keys (base64) of every device currently in the MLS group, this device included. */
  memberKeys(groupId: string): Promise<string[]>;
  /** Commits the removal of the devices owning these identity keys; resolves null when none of them is a member. */
  removeMembers(groupId: string, identityKeysB64: string[]): Promise<{ commitB64: string; epoch: number } | null>;
  joinFromWelcome(welcomeB64: string): Promise<{ groupId: string; epoch: number }>;
  encrypt(groupId: string, plaintextB64: string): Promise<{ ciphertextB64: string; epoch: number }>;
  processIncoming(groupId: string, messageB64: string): Promise<IncomingMlsResult>;
  exportSecret(groupId: string, label: string, length: number): Promise<string>;
  putMessage(record: LocalMessageRecord): Promise<void>;
  listMessages(channelId: string, beforeSortKey: number | null, limit: number): Promise<LocalMessageRecord[]>;
  deleteMessage(channelId: string, messageId: string): Promise<void>;
}
