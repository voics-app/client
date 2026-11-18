import { ArrowClockwise, File as FileIcon, FilePdf, LockSimple, Play, WarningCircle, X } from '@phosphor-icons/react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { usePrefsStore } from '@discordy/core/application/stores/prefsStore';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { Permission } from '@discordy/core/contracts/permissions';
import { spoilersOpen } from '@discordy/core/domain/chatDisplay';
import { can, useGuildPermissions } from '../../shared/hooks/usePermissions';
import { useLightboxStore, type LightboxItem } from '@discordy/core/application/stores/lightboxStore';
import { fractionOf, useTransferStore, type TransferState } from '@discordy/core/application/stores/transferStore';
import { uploadFraction, useUploadStore } from '@discordy/core/application/stores/uploadStore';
import { useI18n } from '../../shared/i18n';
import { displayFilename, formatBytes, gridLayout, gridTiles, isSpoiler, previewKind, previewLines, splitAttachments } from '@discordy/core/domain/media';
import { privateRefOf } from '@discordy/core/domain/privateAttachment';
import { isExpiring, signedUrlExpiryMs } from '@discordy/core/domain/signedUrl';
import type { Attachment } from '@discordy/core/contracts/rest';
import { getRuntime } from '../../app/runtime';
import { MediaPlayer } from './MediaPlayer';
import { AnimatedImage } from '../../shared/ui/AnimatedImage';
import { looksAnimated } from '@discordy/core/domain/stillFrame';
import './attachmentMetadata.css';

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

interface ItemProps {
  attachment: Attachment;
  channelId?: string;
  /** Laid out as a cell of the media grid: fills its cell instead of sizing itself. */
  tile?: boolean;
  /** The message's media attachments, for next/previous in the lightbox. */
  siblings?: Attachment[];
}

function lightboxItem(a: Attachment, src = a.proxy_url ?? a.url): LightboxItem {
  return { kind: previewKind(a) === 'video' ? 'video' : 'image', src, original: a.url, filename: a.filename, description: a.description, width: a.width, height: a.height };
}

function useSpoilerDisclosure(attachment: Attachment, channelId?: string) {
  const spoiler = isSpoiler(attachment);
  const [revealed, setRevealed] = useState(false);
  const mode = usePrefsStore((s) => s.spoilerDisplay);
  const guildId = useGuildStore((s) => (channelId ? s.channels[channelId]?.guild_id : null));
  const open = spoilersOpen(mode, can(useGuildPermissions(guildId), Permission.MANAGE_MESSAGES));
  const hidden = spoiler && !revealed && !open;
  return { hidden, open, reveal: () => setRevealed(true) };
}

function MediaTile({ attachment, onError, tile, siblings, channelId }: { attachment: Attachment; onError: () => void; tile?: boolean; siblings?: Attachment[]; channelId?: string }) {
  const kind = previewKind(attachment);
  const { hidden, open, reveal } = useSpoilerDisclosure(attachment, channelId);
  const src = attachment.proxy_url ?? attachment.url;
  const name = displayFilename(attachment.filename);

  const openViewer = () => {
    const others = (siblings ?? []).filter((a) => a.id === attachment.id || (!privateRefOf(a) && (open || !isSpoiler(a))));
    const items = others.map((a) => (a.id === attachment.id ? lightboxItem(attachment, src) : lightboxItem(a)));
    const index = Math.max(0, others.findIndex((a) => a.id === attachment.id));
    useLightboxStore.getState().open(items.length > 0 ? items : [lightboxItem(attachment, src)], items.length > 0 ? index : 0);
  };
  const aspect = attachment.width && attachment.height && !tile ? `${attachment.width} / ${attachment.height}` : undefined;

  return (
    <button
      type="button"
      className={`media-tile${tile ? ' is-cell' : ''}${hidden ? ' is-spoiler' : ''}`}
      aria-label={hidden ? `Spoiler: ${name}. Click to reveal` : `Open ${name}`}
      onClick={() => (hidden ? reveal() : openViewer())}
      style={{ aspectRatio: aspect }}
    >
      {kind === 'image' ? (
        <AnimatedImage kind="gif" animated={looksAnimated(name) || looksAnimated(attachment.url)} className="media-tile-media" data-ctx="image" data-src={src} data-open={attachment.url} data-filename={name} src={src} alt={hidden ? '' : (attachment.description ?? name)} loading="lazy" draggable={false} onError={onError} />
      ) : (
        <>
          <video className="media-tile-media" src={src} preload="metadata" muted playsInline onError={onError} />
          {!hidden && <span className="media-tile-play" aria-hidden="true"><Play size={22} weight="fill" /></span>}
        </>
      )}
      {hidden && <span className="spoiler-label">Spoiler</span>}
      {!hidden && attachment.description && <span className="alt-badge" title={attachment.description}>ALT</span>}
    </button>
  );
}

/** Spoiler files must not mount text/audio previews or expose download controls before reveal. */
function FileSpoiler({ attachment, channelId, children }: { attachment: Attachment; channelId?: string; children: ReactNode }) {
  const { hidden, reveal } = useSpoilerDisclosure(attachment, channelId);
  if (!hidden) return children;
  const name = displayFilename(attachment.filename);
  return (
    <button type="button" className="attachment-file attachment-spoiler" aria-label={`Spoiler: ${name}. Click to reveal`} onClick={reveal}>
      <FileIcon size={28} weight="light" aria-hidden="true" />
      <span><span className="attachment-name">{name}</span><span className="attachment-size">Spoiler · click to reveal</span></span>
    </button>
  );
}

function FileCard({ attachment, url }: { attachment: Attachment; url: string }) {
  const { locale } = useI18n();
  const local = url.startsWith('blob:');
  const pdf = previewKind(attachment) === 'pdf';
  const name = displayFilename(attachment.filename);
  return (
    <a className="attachment-file" href={url} download={local ? name : undefined} target={local ? undefined : '_blank'} rel="noreferrer">
      {pdf ? <FilePdf size={28} weight="light" /> : <FileIcon size={28} weight="light" />}
      <span>
        <span className="attachment-name">{name}</span>
        <span className="attachment-size">{pdf ? 'PDF · ' : ''}{formatBytes(attachment.size, locale)}</span>
      </span>
    </a>
  );
}

/** First lines of a text or code file, inline. Falls back to the plain file card when it cannot be fetched. */
function TextPreview({ attachment, url }: { attachment: Attachment; url: string }) {
  const { locale } = useI18n();
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch(url, { signal: controller.signal })
      .then((response) => (response.ok ? response.text() : Promise.reject(new Error('unavailable'))))
      .then(setText)
      .catch(() => !controller.signal.aborted && setFailed(true));
    return () => controller.abort();
  }, [url]);
  if (failed) return <FileCard attachment={attachment} url={url} />;
  const { shown, truncated } = previewLines(text ?? '');
  const name = displayFilename(attachment.filename);
  return (
    <div className="text-preview">
      <div className="text-preview-head">
        <a href={url} target="_blank" rel="noreferrer" className="attachment-name">{name}</a>
        <span className="attachment-size">{formatBytes(attachment.size, locale)}</span>
      </div>
      <pre className={`text-preview-body${expanded ? ' is-expanded' : ''}`}><code>{text === null ? 'Loading' : expanded ? text : shown}</code></pre>
      {text !== null && truncated && (
        <button type="button" className="text-preview-more" onClick={() => setExpanded((v) => !v)}>{expanded ? 'Show less' : 'Show more'}</button>
      )}
    </div>
  );
}

function MediaAttachment({ attachment: original, channelId, tile, siblings }: ItemProps) {
  const { url, refresh } = useFreshUrl(original, channelId);
  const inlineMedia = usePrefsStore((s) => s.inlineMedia);
  const attachment = { ...original, url, proxy_url: url };
  const retried = useRef(false);
  const onError = () => {
    if (retried.current) return;
    retried.current = true;
    refresh();
  };
  const kind = previewKind(attachment);
  if ((kind === 'image' || kind === 'video') && !inlineMedia) return <FileSpoiler attachment={attachment} channelId={channelId}><FileCard attachment={attachment} url={url} /></FileSpoiler>;
  if (kind === 'image' || kind === 'video') return <MediaTile attachment={attachment} onError={onError} tile={tile} siblings={siblings} channelId={channelId} />;
  if (kind === 'audio') {
    return (
      <FileSpoiler attachment={attachment} channelId={channelId}>
      <div className="attachment-audio">
        <span className="attachment-name">{displayFilename(attachment.filename)}</span>
        <MediaPlayer kind="audio" src={url} label={attachment.filename} onError={onError} />
      </div>
      </FileSpoiler>
    );
  }
  if (kind === 'text') return <FileSpoiler attachment={attachment} channelId={channelId}><TextPreview attachment={attachment} url={url} /></FileSpoiler>;
  return <FileSpoiler attachment={attachment} channelId={channelId}><FileCard attachment={attachment} url={url} /></FileSpoiler>;
}

/** Files from Ephemeral and P2P chats: decrypted on this device, then shown exactly like any other attachment. */
function PrivateAttachmentView({ attachment, channelId, tile, siblings }: ItemProps & { channelId: string }) {
  const { locale, number } = useI18n();
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

  if (url) return <MediaAttachment attachment={{ ...attachment, url }} tile={tile} siblings={siblings} />;

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
          {label} · {formatBytes(attachment.size, locale)}
          {transfer && fraction > 0 && fraction < 1 ? ` · ${number(fraction, { style: 'percent', maximumFractionDigits: 0 })}` : ''}
        </span>
        <progress className="attachment-progress" max={1} value={transfer && fraction > 0 ? fraction : undefined} aria-label={`${label} ${attachment.filename}`} />
      </span>
    </div>
  );
}

export function AttachmentView({ attachment, channelId, tile, siblings }: ItemProps & { channelId: string }) {
  if (privateRefOf(attachment)) return <PrivateAttachmentView attachment={attachment} channelId={channelId} tile={tile} siblings={siblings} />;
  return <MediaAttachment attachment={attachment} channelId={channelId} tile={tile} siblings={siblings} />;
}

/** All attachments of a message: images and videos in a Discord-style grid, other files listed below. */
export function MessageAttachments({ attachments, channelId }: { attachments: Attachment[]; channelId: string }) {
  const inlineMedia = usePrefsStore((s) => s.inlineMedia);
  const split = splitAttachments(attachments);
  const media = inlineMedia ? split.media : [];
  const files = inlineMedia ? split.files : attachments;
  const { shown: tiles, hidden } = gridTiles(media.length);
  const layout = media.length > 1 ? gridLayout(tiles) : null;
  const shown = media.slice(0, tiles);
  return (
    <div className="attachments">
      {media.length > 0 && (
        <div className={`media-grid${layout ? ' is-multi' : ''}`} data-count={tiles} style={layout ? { gridTemplateRows: `repeat(${layout.rows}, 140px)` } : undefined}>
          {shown.map((a, i) => {
            const cell = layout?.cells[i];
            return (
              <div key={a.id} className="media-cell" style={cell ? { gridColumn: `${cell.colStart} / span ${cell.colSpan}`, gridRow: `${cell.rowStart} / span ${cell.rowSpan}` } : undefined}>
                <AttachmentView attachment={a} channelId={channelId} tile={Boolean(layout)} siblings={media} />
                {hidden > 0 && i === tiles - 1 && <span className="media-more" aria-hidden="true">+{hidden}</span>}
              </div>
            );
          })}
        </div>
      )}
      {files.map((a) => <AttachmentView key={a.id} attachment={a} channelId={channelId} />)}
    </div>
  );
}

/** Upload of the files of a message being sent: progress and a way to cancel. */
export function UploadProgress({ nonce }: { nonce: string }) {
  const { t, locale, number } = useI18n();
  const upload = useUploadStore((s) => s.uploads[nonce]);
  if (!upload) return null;
  const fraction = uploadFraction(upload);
  return (
    <div className="attachment-file attachment-pending upload-progress" role="status" aria-label={t('files.percent', { count: Math.round(fraction * 100) })}>
      <span>
        <span className="attachment-name">{t('files.uploading')}</span>
        <span className="attachment-size tnum">{t('files.transferred', { loaded: formatBytes(upload.loaded, locale), total: formatBytes(upload.total, locale), percent: number(fraction, { style: 'percent', maximumFractionDigits: 0 }) })}</span>
        <progress className="attachment-progress" max={1} value={fraction} aria-label={t('files.progress')} />
      </span>
      <button type="button" className="attachment-retry" onClick={upload.abort}><X size={13} /> {t('common.cancel')}</button>
    </div>
  );
}
