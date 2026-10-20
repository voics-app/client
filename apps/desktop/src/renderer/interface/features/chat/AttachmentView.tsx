import { ArrowClockwise, File as FileIcon, LockSimple, WarningCircle } from '@phosphor-icons/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { fractionOf, useTransferStore, type TransferState } from '@renderer/application/stores/transferStore';
import { privateRefOf } from '@renderer/domain/privateAttachment';
import { isExpiring, signedUrlExpiryMs } from '@renderer/domain/signedUrl';
import type { Attachment } from '@shared/contracts/rest';
import { getRuntime } from '../../app/runtime';

function sizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

const STATE_LABEL: Record<TransferState, string> = {
  encrypting: 'Encrypting',
  uploading: 'Uploading encrypted file',
  sending: 'Sending directly',
  downloading: 'Downloading',
  receiving: 'Receiving',
  decrypting: 'Decrypting and verifying',
  done: 'Ready',
  error: 'Failed',
};

/**
 * Download links are signed and expire (about a day). The link is re-signed before it lapses and
 * once more if the browser reports a load error (a 403 or 410 from an expired or rotated link).
 */
function useFreshUrl(attachment: Attachment, channelId: string | undefined): { url: string; refresh: () => void } {
  const [fresh, setFresh] = useState<{ source: string; url: string } | null>(null);
  const source = attachment.proxy_url ?? attachment.url;
  const url = fresh?.source === source ? fresh.url : source;
  const refresh = useCallback(() => {
    if (!channelId || !source.startsWith('http')) return;
    getRuntime()
      .api.refreshAttachmentUrls(channelId, [source])
      .then(({ refreshed_urls }) => {
        const next = refreshed_urls[0]?.refreshed;
        if (next) setFresh({ source, url: next });
      })
      .catch(() => undefined);
  }, [channelId, source]);

  useEffect(() => {
    const expiry = signedUrlExpiryMs(url);
    if (expiry === null) return;
    if (isExpiring(url, Date.now())) {
      refresh();
      return;
    }
    const timer = setTimeout(refresh, Math.min(expiry - Date.now() - 60_000, 2 ** 31 - 1));
    return () => clearTimeout(timer);
  }, [url, refresh]);

  return { url, refresh };
}

function MediaAttachment({ attachment: original, channelId }: { attachment: Attachment; channelId?: string }) {
  const { url, refresh } = useFreshUrl(original, channelId);
  const attachment = { ...original, url, proxy_url: url };
  const retried = useRef(false);
  const onError = () => {
    if (retried.current) return;
    retried.current = true;
    refresh();
  };
  const isImage = attachment.content_type?.startsWith('image/');
  const isVideo = attachment.content_type?.startsWith('video/');
  const isAudio = attachment.content_type?.startsWith('audio/');
  if (isImage) return <img className="attachment-image" src={attachment.proxy_url ?? attachment.url} alt={attachment.description ?? attachment.filename} loading="lazy" onError={onError} style={{ aspectRatio: attachment.width && attachment.height ? `${attachment.width} / ${attachment.height}` : undefined }} />;
  if (isVideo) return <video className="attachment-image" src={attachment.url} controls preload="metadata" onError={onError} />;
  if (isAudio) return <audio src={attachment.url} controls preload="none" onError={onError} />;
  const local = attachment.url.startsWith('blob:');
  return (
    <a className="attachment-file" href={attachment.url} download={local ? attachment.filename : undefined} target={local ? undefined : '_blank'} rel="noreferrer">
      <FileIcon size={28} weight="light" />
      <span>
        <span className="attachment-name">{attachment.filename}</span>
        <span className="attachment-size">{sizeLabel(attachment.size)}</span>
      </span>
    </a>
  );
}

/** Files from Ephemeral and P2P chats: decrypted on this device, then shown exactly like any other attachment. */
function PrivateAttachmentView({ attachment, channelId }: { attachment: Attachment; channelId: string }) {
  const ref = privateRefOf(attachment)!;
  const transfer = useTransferStore((s) => s.transfers[ref.id]);
  const [url, setUrl] = useState<string | null>(() => getRuntime().privacy.attachments.urlFor(ref.id));
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const done = transfer?.state === 'done';

  useEffect(() => {
    let cancelled = false;
    const attachments = getRuntime().privacy.attachments;
    const held = attachments.urlFor(ref.id);
    if (held) {
      setUrl(held);
      return;
    }
    if (ref.source.kind !== 'cdn' && !done) return;
    setError(null);
    attachments
      .resolve(attachment, channelId)
      .then((resolved) => !cancelled && setUrl(resolved))
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : 'Could not open this file.'));
    return () => {
      cancelled = true;
    };
  }, [attachment, channelId, ref, done, attempt]);

  if (url) return <MediaAttachment attachment={{ ...attachment, url }} />;

  const failed = error ?? (transfer?.state === 'error' ? (transfer.error ?? 'Transfer failed.') : null);
  if (failed) {
    return (
      <div className="attachment-file attachment-pending is-failed" role="alert">
        <WarningCircle size={28} weight="light" />
        <span>
          <span className="attachment-name">{attachment.filename}</span>
          <span className="attachment-size">{failed}</span>
        </span>
        {ref.source.kind === 'cdn' && (
          <button type="button" className="attachment-retry" onClick={() => setAttempt((n) => n + 1)}>
            <ArrowClockwise size={13} /> Retry
          </button>
        )}
      </div>
    );
  }
  const fraction = fractionOf(transfer);
  const label = STATE_LABEL[transfer?.state ?? 'downloading'];
  return (
    <div className="attachment-file attachment-pending" role="status" aria-label={`${attachment.filename}: ${label}`}>
      <LockSimple size={28} weight="light" />
      <span>
        <span className="attachment-name">{attachment.filename}</span>
        <span className="attachment-size">
          {label} · {sizeLabel(attachment.size)}
          {transfer && fraction > 0 && fraction < 1 ? ` · ${Math.round(fraction * 100)}%` : ''}
        </span>
        <progress className="attachment-progress" max={1} value={transfer && fraction > 0 ? fraction : undefined} aria-label={`${label} ${attachment.filename}`} />
      </span>
    </div>
  );
}

export function AttachmentView({ attachment, channelId }: { attachment: Attachment; channelId: string }) {
  if (privateRefOf(attachment)) return <PrivateAttachmentView attachment={attachment} channelId={channelId} />;
  return <MediaAttachment attachment={attachment} channelId={channelId} />;
}
