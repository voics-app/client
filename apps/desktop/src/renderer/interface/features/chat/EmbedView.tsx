import { Play, X } from '@phosphor-icons/react';
import { useState } from 'react';
import { useLightboxStore } from '@discordy/core/application/stores/lightboxStore';
import { usePrefsStore } from '@discordy/core/application/stores/prefsStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import type { ChatMessage } from '@discordy/core/application/stores/messageStore';
import { canSuppressEmbeds, embedMediaSrc, embedPlayback, isBareMediaEmbed, isLinkPreview } from '@discordy/core/domain/media';
import { Permission } from '@discordy/core/contracts/permissions';
import type { Embed, EmbedMedia } from '@discordy/core/contracts/rest';
import { suppressEmbeds } from '../../app/messageActions';
import { can, useChannelPermissions } from '../../shared/hooks/usePermissions';
import { AnimatedImage } from '../../shared/ui/AnimatedImage';
import { looksAnimated } from '@discordy/core/domain/stillFrame';
import { MediaPlayer } from './MediaPlayer';

function filenameOf(media: EmbedMedia): string {
  return media.url.split('/').pop()?.split('?')[0] || 'image';
}

function openInLightbox(media: EmbedMedia, src: string): void {
  useLightboxStore.getState().open([{ kind: 'image', src, original: media.url, filename: filenameOf(media), width: media.width, height: media.height }]);
}

function EmbedImage({ media, className }: { media: EmbedMedia; className: string }) {
  const src = embedMediaSrc(media);
  if (!src) return null;
  return (
    <button type="button" className={`embed-media-button ${className}`} aria-label="View image" onClick={() => openInLightbox(media, src)}>
      <AnimatedImage kind="gif" animated={looksAnimated(src) || looksAnimated(media.url)} data-ctx="image" data-src={src} data-open={media.url} data-filename={filenameOf(media)} src={src} alt="" loading="lazy" draggable={false} style={{ aspectRatio: media.width && media.height ? `${media.width} / ${media.height}` : undefined }} />
    </button>
  );
}

/** Player of an embed: allow-listed iframe players load only after a click; other video plays through the proxy. */
function EmbedVideo({ embed }: { embed: Embed }) {
  const [playing, setPlaying] = useState(false);
  const playback = embedPlayback(embed);
  if (!playback) return null;
  const poster = embedMediaSrc(embed.thumbnail) ?? embedMediaSrc(embed.image);
  const aspect = embed.video?.width && embed.video?.height ? `${embed.video.width} / ${embed.video.height}` : '16 / 9';
  if (playback.kind === 'file') {
    return (
      <div className="embed-video" style={{ aspectRatio: aspect }}>
        <MediaPlayer kind="video" src={playback.src} label={embed.title ?? 'video'} />
      </div>
    );
  }
  return (
    <div className="embed-video" style={{ aspectRatio: aspect }}>
      {playing ? (
        <iframe
          title={embed.title ?? 'Video player'}
          src={playback.src}
          sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      ) : (
        <button type="button" className="embed-video-poster" aria-label={`Play ${embed.title ?? 'video'}`} onClick={() => setPlaying(true)}>
          {poster && <img src={poster} alt="" loading="lazy" draggable={false} />}
          <span className="embed-video-play"><Play size={26} weight="fill" /></span>
        </button>
      )}
    </div>
  );
}

function EmbedCard({ embed }: { embed: Embed }) {
  const color = embed.color ? `#${embed.color.toString(16).padStart(6, '0')}` : 'var(--accent)';
  const hasPlayer = embedPlayback(embed) !== null;
  const authorIcon = embed.author?.proxy_icon_url;
  const footerIcon = embed.footer?.proxy_icon_url;
  const thumb = !hasPlayer ? embed.thumbnail : undefined;
  return (
    <div className="embed" style={{ borderLeftColor: color }}>
      <div className="embed-body">
        {embed.provider?.name && <p className="embed-provider">{embed.provider.name}</p>}
        {embed.author && (
          <p className="embed-author">
            {authorIcon && <img src={authorIcon} alt="" width={20} height={20} loading="lazy" />}
            {embed.author.url ? <a href={embed.author.url} data-ctx="link" data-url={embed.author.url} target="_blank" rel="noreferrer">{embed.author.name}</a> : embed.author.name}
          </p>
        )}
        {embed.title && <p className="embed-title">{embed.url ? <a href={embed.url} data-ctx="link" data-url={embed.url} target="_blank" rel="noreferrer">{embed.title}</a> : embed.title}</p>}
        {embed.description && <p className="embed-desc">{embed.description}</p>}
        {embed.fields && (
          <div className="embed-fields">
            {embed.fields.map((f, i) => (
              <div key={i} className={f.inline ? 'is-inline' : ''}>
                <p className="embed-field-name">{f.name}</p>
                <p>{f.value}</p>
              </div>
            ))}
          </div>
        )}
        {embed.image && <EmbedImage media={embed.image} className="embed-image" />}
        <EmbedVideo embed={embed} />
        {embed.footer && (
          <p className="embed-footer">
            {footerIcon && <img src={footerIcon} alt="" width={16} height={16} loading="lazy" />}
            {embed.footer.text}
          </p>
        )}
      </div>
      {thumb && !embed.image && <EmbedImage media={thumb} className="embed-thumb" />}
    </div>
  );
}

/** A direct image or GIF link: just the picture. */
function BareEmbed({ embed }: { embed: Embed }) {
  const media = embed.thumbnail ?? embed.image;
  return media ? <EmbedImage media={media} className="embed-bare" /> : null;
}

function EmbedItem({ embed }: { embed: Embed }) {
  if (isBareMediaEmbed(embed)) return <BareEmbed embed={embed} />;
  if (embed.type === 'video' && !embed.title && !embed.description && embed.video && !embed.provider) {
    return <div className="embed-bare-video"><EmbedVideo embed={embed} /></div>;
  }
  return <EmbedCard embed={embed} />;
}

/** The embeds of a message. Link previews can be hidden in settings, and removed with the hover "x" by the author or a moderator. */
export function MessageEmbeds({ message }: { message: ChatMessage }) {
  const showPreviews = usePrefsStore((s) => s.linkPreviews);
  const showEmbeds = usePrefsStore((s) => s.inlineEmbeds);
  const me = useSessionStore((s) => s.user?.id);
  const permissions = useChannelPermissions(message.channel_id);
  const visible = showEmbeds ? message.embeds.filter((embed) => showPreviews || !isLinkPreview(embed)) : [];
  if (visible.length === 0) return null;
  const hasPreview = visible.some(isLinkPreview);
  const removable = hasPreview && message.deliveryMode !== 'ephemeral' && message.deliveryMode !== 'p2p'
    && canSuppressEmbeds({ isAuthor: me === message.author.id, canManageMessages: can(permissions, Permission.MANAGE_MESSAGES) });
  return (
    <div className="embeds">
      {visible.map((embed, i) => <EmbedItem key={i} embed={embed} />)}
      {removable && (
        <button type="button" className="embed-remove" aria-label="Remove all link previews from this message" title="Remove previews" onClick={() => void suppressEmbeds(message)}>
          <X size={12} weight="bold" />
        </button>
      )}
    </div>
  );
}
