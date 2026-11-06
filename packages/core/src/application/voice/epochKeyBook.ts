/**
 * Keeps the frame keys of a call in step with the MLS epochs for every sender a cryptor knows (this device
 * and each remote participant). A cryptor installs keys through it so that desktop and phone derive the
 * same key material: 32 bytes of exporter secret per sender and key index (`frameKeyLabel`).
 */
import { FRAME_KEY_MATERIAL_BYTES, keyIndexOf } from '../../domain/frameFormat';
import type { KeyMaterialSource } from '../ports/voice';

export type InstallKey = (userId: string, keyIndex: number, material: Uint8Array) => Promise<void>;

export class EpochKeyBook {
  private latest: { generation: number; material: KeyMaterialSource } | null = null;
  private readonly users = new Set<string>();

  constructor(private readonly install: InstallKey) {}

  /** Installs the epoch's key for every known sender. Rejects if any key cannot be derived or installed. */
  async setEpoch(generation: number, material: KeyMaterialSource): Promise<void> {
    this.latest = { generation, material };
    for (const userId of this.users) await this.installFor(userId);
  }

  /** Registers a sender and installs the latest epoch's key for it, if there is one. */
  async addUser(userId: string): Promise<void> {
    this.users.add(userId);
    if (this.latest) await this.installFor(userId);
  }

  /** Forgets the epoch, so later senders get no key until the next `setEpoch`. */
  clear(): void {
    this.latest = null;
  }

  private async installFor(userId: string): Promise<void> {
    const latest = this.latest;
    if (!latest) return;
    const keyIndex = keyIndexOf(latest.generation);
    const material = await latest.material(userId, keyIndex);
    if (material.length !== FRAME_KEY_MATERIAL_BYTES) throw new Error('frame key material has the wrong length');
    await this.install(userId, keyIndex, material);
  }
}
