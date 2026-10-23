/**
 * DAVE-style media E2EE control plane (voice ops 21-31). Group membership runs
 * on the native MLS engine; keys for the frame worker come from the MLS
 * exporter secret of the current epoch. The session never reports `active`
 * until an epoch key is installed in the worker AND activated by
 * EXECUTE_TRANSITION (or by founding the group), so the UI cannot claim
 * encryption that is not happening.
 *
 * Payload shapes are JSON with base64 blobs. P8 pins only the opcode numbers;
 * the shapes below are the client's contract with the voice signaling node:
 *   25 EXTERNAL_SENDER   <- { founder?: boolean, external_sender_b64?: string }
 *   26 MLS_KEY_PACKAGE   -> { key_package_b64 }       / <- { user_id, key_package_b64 } (relayed to the committer)
 *   27 MLS_PROPOSALS     <- { proposals_b64: string[] }
 *   28 MLS_COMMIT_WELCOME-> { transition_id, commit, welcome?, recipient_ids?: string[] }   (the keys the voice node routes on)
 *   29 MLS_ANNOUNCE_COMMIT <- { transition_id, commit }
 *   30 MLS_WELCOME       <- { transition_id, welcome }
 *   21/22 PREPARE/EXECUTE_TRANSITION: never sent by the voice node (it relays 21 verbatim, which would
 *        ping-pong an ack), so epochs are activated as soon as their key is installed.
 *   31 MLS_INVALID_COMMIT<- { transition_id }
 */
import { VoiceOp } from '@shared/contracts/voice';
import type { CryptoBridge } from '@shared/ipc';
import type { FrameCryptorPort } from './frameCryptor';

export const FRAME_KEY_LABEL = 'discordy-voice-frame-key-v1';

export type DaveCrypto = Pick<
  CryptoBridge,
  'generateKeyPackages' | 'hasGroup' | 'createGroup' | 'addMembers' | 'removeMembers' | 'joinFromWelcome' | 'processIncoming' | 'exportSecret'
>;

export interface DaveOptions {
  groupId: string;
  userId: string;
  crypto: DaveCrypto;
  cryptor: FrameCryptorPort;
  /** Identity public keys (base64) of every device of a user; needed to remove a departed participant. */
  identityKeysOf?(userId: string): Promise<string[]>;
  /** Fallback for voice nodes older than 0.1.6 that send no `founder` flag: true when others were in the call at join. */
  hasPeers?(): boolean;
  send(op: number, d: unknown): void;
  onActive(active: boolean): void;
  onError(message: string): void;
}

const fromB64 = (value: string): Uint8Array => Uint8Array.from(atob(value), (c) => c.charCodeAt(0));

export class DaveSession {
  private groupId: string;
  private committer = false;
  private queue: Promise<void> = Promise.resolve();
  private active = false;
  private transitionSeq = 0;
  private readonly pending = new Map<number, number>();
  epoch: number | null = null;

  constructor(private readonly options: DaveOptions) {
    this.groupId = options.groupId;
  }

  get isActive(): boolean {
    return this.active;
  }

  async start(_protocolVersion: number): Promise<void> {
    if (!this.options.cryptor.supported) {
      this.options.onError('This runtime cannot protect media frames; refusing to join an end-to-end encrypted call.');
      return;
    }
    await this.guard(() => this.sendKeyPackage());
  }

  private async found(): Promise<void> {
    const epoch = await this.options.crypto.createGroup(this.groupId);
    this.committer = true;
    await this.installEpoch(epoch);
    this.activate(epoch);
  }

  /**
   * A participant left the call. The committer removes their devices and advances the epoch, which
   * rotates the media key (derived from the new epoch's exporter secret) so the departed device
   * cannot decrypt frames sent after the transition. Non-committers rotate on ANNOUNCE_COMMIT.
   */
  participantLeft(userId: string): Promise<void> {
    return this.guard(async () => {
      if (!this.committer || !this.options.identityKeysOf) return;
      const keys = await this.options.identityKeysOf(userId);
      const removal = await this.options.crypto.removeMembers(this.groupId, keys);
      if (!removal) return;
      this.transitionSeq += 1;
      await this.installEpoch(removal.epoch);
      this.options.send(VoiceOp.DAVE_MLS_COMMIT_WELCOME, { transition_id: this.transitionSeq, commit: removal.commitB64 });
      this.activate(removal.epoch);
    });
  }

  stop(): void {
    this.options.cryptor.clear();
    this.pending.clear();
    this.setActive(false);
  }

  /** Ops run strictly one after another: the node announces a commit to everybody, including the member
   * it also sends the welcome to, and a failure of the first must not wipe the keys the second installs. */
  handleOp(op: number, d: unknown): Promise<void> {
    const run = this.queue.then(() => this.guard(() => this.dispatch(op, d as Record<string, unknown>)));
    this.queue = run;
    return run;
  }

  private async guard(fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (error) {
      this.options.cryptor.clear();
      this.setActive(false);
      this.options.onError(error instanceof Error ? error.message : String(error));
    }
  }

  private setActive(active: boolean): void {
    if (this.active === active) return;
    this.active = active;
    this.options.onActive(active);
  }

  private async sendKeyPackage(): Promise<void> {
    const [pkg] = await this.options.crypto.generateKeyPackages(1);
    if (!pkg) throw new Error('crypto engine returned no key package');
    this.options.send(VoiceOp.DAVE_MLS_KEY_PACKAGE, { key_package_b64: pkg });
  }

  /** Derives and installs keys for an epoch without activating them for sending. */
  private async installEpoch(epoch: number): Promise<void> {
    const secret = await this.options.crypto.exportSecret(this.groupId, FRAME_KEY_LABEL, 32);
    await this.options.cryptor.setEpoch(epoch & 0xff, fromB64(secret));
    this.epoch = epoch;
  }

  private activate(epoch: number): void {
    this.options.cryptor.activate(epoch & 0xff);
    this.options.cryptor.setPassthrough(false);
    this.setActive(true);
  }

  private async dispatch(op: number, d: Record<string, unknown>): Promise<void> {
    const { crypto, cryptor, send } = this.options;
    switch (op) {
      case VoiceOp.DAVE_MLS_EXTERNAL_SENDER: {
        const founder = d.founder === undefined ? this.options.hasPeers?.() === false : d.founder === true;
        if (founder && !(await crypto.hasGroup(this.groupId))) {
          await this.found();
        }
        return;
      }
      case VoiceOp.DAVE_MLS_KEY_PACKAGE: {
        if (!this.committer) return;
        const userId = String(d.user_id);
        const result = await crypto.addMembers(this.groupId, [String(d.key_package_b64)]);
        this.transitionSeq += 1;
        await this.installEpoch(result.epoch);
        send(VoiceOp.DAVE_MLS_COMMIT_WELCOME, {
          transition_id: this.transitionSeq,
          commit: result.commitB64,
          welcome: result.welcomeB64,
          recipient_ids: [userId],
        });
        this.activate(result.epoch);
        return;
      }
      case VoiceOp.DAVE_MLS_PROPOSALS: {
        for (const proposal of (d.proposals_b64 as string[] | undefined) ?? []) await crypto.processIncoming(this.groupId, proposal);
        return;
      }
      case VoiceOp.DAVE_MLS_ANNOUNCE_COMMIT: {
        // A joiner is also sent the commit that adds it; it holds no group yet and gets its keys from the welcome.
        if (!(await crypto.hasGroup(this.groupId))) return;
        const result = await crypto.processIncoming(this.groupId, String(d.commit ?? d.commit_b64));
        if (result.kind !== 'commit' || result.epoch === undefined) throw new Error('announced commit could not be applied');
        await this.installEpoch(result.epoch);
        this.activate(result.epoch);
        return;
      }
      case VoiceOp.DAVE_MLS_WELCOME: {
        const joined = await crypto.joinFromWelcome(String(d.welcome ?? d.welcome_b64));
        this.groupId = joined.groupId;
        await this.installEpoch(joined.epoch);
        this.activate(joined.epoch);
        return;
      }
      case VoiceOp.DAVE_PREPARE_TRANSITION: {
        cryptor.setPassthrough(true);
        return;
      }
      case VoiceOp.DAVE_EXECUTE_TRANSITION: {
        const id = Number(d.transition_id);
        const epoch = this.pending.get(id);
        this.pending.delete(id);
        if (epoch === undefined) {
          cryptor.setPassthrough(false);
          return;
        }
        this.activate(epoch);
        return;
      }
      case VoiceOp.DAVE_MLS_INVALID_COMMIT: {
        this.pending.delete(Number(d.transition_id));
        cryptor.clear();
        this.setActive(false);
        await this.sendKeyPackage();
        return;
      }
      default:
    }
  }
}
