/**
 * Attachments for the private delivery modes. Files are encrypted on this device with a random
 * AES-256-GCM key; only ciphertext ever leaves it (to the CDN for Ephemeral, to the peer for P2P).
 * Keys, nonces, hashes and names travel inside the encrypted message envelope.
 */
import type { Attachment } from '@shared/contracts/rest';
import {
  ATTACHMENTS_BUCKET,
  checkOutgoingFiles,
  privateRefOf,
  sanitizeFileName,
  safeMime,
  toAttachment,
  type PrivateAttachment,
  type PrivateFileRef,
  type PrivateMode,
} from '@renderer/domain/privateAttachment';
import type { ApiPort } from '../ports/api';
import { useTransferStore } from '../stores/transferStore';
import { AttachmentError, decryptFile, encryptFile, type AttachmentFailure, type EncryptedFile } from './attachmentCipher';

export interface AttachmentDeps {
  api: Pick<ApiPort, 'createAttachmentSlots' | 'upload'>;
  fetchBytes: (url: string) => Promise<Uint8Array>;
  /** Public CDN origin of the active connection profile. */
  cdnBase: () => string;
  createObjectUrl?: (blob: Blob) => string;
}

export interface OutgoingP2PFile {
  attachment: PrivateAttachment;
  ciphertext: Uint8Array;
}

const OPAQUE_UPLOAD_NAME = 'blob.bin';

export class AttachmentService {
  private readonly blobs = new Map<string, Blob>();
  private readonly urls = new Map<string, string>();
  private readonly inflight = new Map<string, Promise<string>>();

  constructor(private readonly deps: AttachmentDeps) {}

  /** Encrypts the files and uploads only the ciphertext through the presigned-upload flow. */
  async prepareCdn(channelId: string, files: File[], messageId: string): Promise<PrivateAttachment[]> {
    this.requireAcceptable(files, 'ephemeral');
    const ids = files.map((_f, i) => `${messageId}:${i}`);
    const encrypted: EncryptedFile[] = [];
    for (const [i, file] of files.entries()) {
      this.track(ids[i]!, { state: 'encrypting', loaded: 0, total: file.size });
      encrypted.push(await encryptFile(new Uint8Array(await file.arrayBuffer())));
    }
    try {
      const { attachments: slots } = await this.deps.api.createAttachmentSlots(
        channelId,
        encrypted.map((e) => ({ filename: OPAQUE_UPLOAD_NAME, file_size: e.ciphertext.length })),
      );
      if (slots.length !== files.length) throw new Error('The server returned the wrong number of upload slots.');
      await Promise.all(
        slots.map(async (slot, i) => {
          this.track(ids[i]!, { state: 'uploading', loaded: 0, total: files[i]!.size });
          await this.deps.api.upload(slot.upload_url, new Blob([encrypted[i]!.ciphertext as BlobPart], { type: 'application/octet-stream' }));
          this.track(ids[i]!, { state: 'done', loaded: files[i]!.size });
        }),
      );
      return slots.map((slot, i) => this.remember(files[i]!, ids[i]!, encrypted[i]!, { kind: 'cdn', object_key: slot.upload_filename }));
    } catch (error) {
      const failure = this.fail(ids, 'upload_failed', `Upload failed: ${error instanceof Error ? error.message : String(error)}`);
      throw failure;
    }
  }

  /** Encrypts for a direct transfer; the caller streams `ciphertext` over the data channel. */
  async prepareP2P(files: File[], messageId: string): Promise<OutgoingP2PFile[]> {
    this.requireAcceptable(files, 'p2p');
    const out: OutgoingP2PFile[] = [];
    for (const [i, file] of files.entries()) {
      const id = `${messageId}:${i}`;
      this.track(id, { state: 'encrypting', loaded: 0, total: file.size });
      const enc = await encryptFile(new Uint8Array(await file.arrayBuffer()));
      out.push({ attachment: this.remember(file, id, enc, { kind: 'p2p' }), ciphertext: enc.ciphertext });
    }
    return out;
  }

  /** Stores a received and verified plaintext so the attachment can be displayed. */
  async accept(ref: PrivateFileRef, ciphertext: Uint8Array): Promise<void> {
    this.track(ref.id, { state: 'decrypting', loaded: ref.size, total: ref.size });
    try {
      const plain = await decryptFile(ciphertext, ref);
      this.blobs.set(ref.id, new Blob([plain as BlobPart], { type: ref.mime }));
      this.track(ref.id, { state: 'done' });
    } catch (error) {
      this.fail([ref.id], error instanceof AttachmentError ? error.reason : 'transfer_failed', error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  /** Blob URL for display, fetching and decrypting from the CDN when this device does not hold the file yet. */
  resolve(attachment: Attachment, channelId: string): Promise<string> {
    const ref = privateRefOf(attachment);
    if (!ref) return Promise.resolve(attachment.url);
    const cached = this.urlFor(ref.id);
    if (cached) return Promise.resolve(cached);
    const pending = this.inflight.get(ref.id);
    if (pending) return pending;
    const run = this.download(ref, channelId).finally(() => this.inflight.delete(ref.id));
    this.inflight.set(ref.id, run);
    return run;
  }

  /** Blob URL when the plaintext is already held in memory. */
  urlFor(id: string): string | null {
    const known = this.urls.get(id);
    if (known) return known;
    const blob = this.blobs.get(id);
    if (!blob) return null;
    const url = (this.deps.createObjectUrl ?? URL.createObjectURL.bind(URL))(blob);
    this.urls.set(id, url);
    return url;
  }

  // ---- internals ----------------------------------------------------------------

  private async download(ref: PrivateFileRef, channelId: string): Promise<string> {
    if (ref.source.kind !== 'cdn') {
      throw this.fail([ref.id], 'unavailable', 'This file was sent peer to peer and is no longer on this device.');
    }
    if (!ref.source.object_key.startsWith(`attachments/${channelId}/`)) {
      throw this.fail([ref.id], 'integrity', 'The attachment does not belong to this chat and was refused.');
    }
    this.track(ref.id, { state: 'downloading', loaded: 0, total: ref.size });
    let ciphertext: Uint8Array;
    try {
      ciphertext = await this.deps.fetchBytes(`${this.deps.cdnBase().replace(/\/$/, '')}/${ATTACHMENTS_BUCKET}/${ref.source.object_key}`);
    } catch (error) {
      throw this.fail([ref.id], 'download_failed', `Download failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    await this.accept(ref, ciphertext);
    const url = this.urlFor(ref.id);
    if (!url) throw this.fail([ref.id], 'unavailable', 'The decrypted file is not available.');
    return url;
  }

  private remember(file: File, id: string, enc: EncryptedFile, source: PrivateFileRef['source']): PrivateAttachment {
    this.blobs.set(id, file);
    return toAttachment({
      id,
      name: sanitizeFileName(file.name),
      mime: safeMime(file.type),
      size: file.size,
      sha256_b64: enc.sha256_b64,
      key_b64: enc.key_b64,
      nonce_b64: enc.nonce_b64,
      source,
    });
  }

  private requireAcceptable(files: File[], mode: PrivateMode): void {
    const problem = checkOutgoingFiles(files, mode);
    if (!problem) return;
    const reason: AttachmentFailure = files.length > 10 ? 'too_many' : files.some((f) => f.size === 0) ? 'empty' : 'too_large';
    throw new AttachmentError(reason, problem);
  }

  private track(id: string, patch: Parameters<ReturnType<typeof useTransferStore.getState>['update']>[1]): void {
    useTransferStore.getState().update(id, patch);
  }

  private fail(ids: string[], reason: AttachmentFailure, message: string): AttachmentError {
    for (const id of ids) this.track(id, { state: 'error', reason, error: message });
    return new AttachmentError(reason, message);
  }
}

