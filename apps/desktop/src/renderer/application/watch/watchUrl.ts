/**
 * Watch Together source allow-list. Only plain https media files (or a file the
 * user picked locally, shared as `local:<name>`) are accepted. Streaming
 * services with DRM are refused on purpose: Watch Together plays each peer's
 * own copy of a source, it is not a way around protected content.
 */
const MEDIA_EXTENSIONS = new Set(['mp4', 'm4v', 'webm', 'mov', 'ogv', 'ogg', 'mp3', 'm4a', 'wav', 'flac', 'opus', 'aac']);
const DRM_HOST_SUFFIXES = [
  'netflix.com',
  'disneyplus.com',
  'primevideo.com',
  'hulu.com',
  'hbomax.com',
  'max.com',
  'peacocktv.com',
  'paramountplus.com',
  'apple.com',
  'spotify.com',
  'crunchyroll.com',
];

export type WatchSource =
  | { kind: 'remote'; url: string }
  | { kind: 'local'; name: string };

export type WatchUrlResult = { ok: true; source: WatchSource } | { ok: false; reason: string };

export function validateWatchUrl(raw: string): WatchUrlResult {
  const value = raw.trim();
  if (value.startsWith('local:')) {
    const name = value.slice('local:'.length).trim();
    return name ? { ok: true, source: { kind: 'local', name } } : { ok: false, reason: 'Missing file name.' };
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, reason: 'Enter a valid https link to a media file.' };
  }
  if (url.protocol !== 'https:') return { ok: false, reason: 'Only https links are allowed.' };
  if (url.username || url.password) return { ok: false, reason: 'Links with credentials are not allowed.' };
  const host = url.hostname.toLowerCase();
  if (DRM_HOST_SUFFIXES.some((s) => host === s || host.endsWith(`.${s}`))) {
    return { ok: false, reason: 'DRM-protected services cannot be played in Watch Together.' };
  }
  const extension = url.pathname.split('.').pop()?.toLowerCase() ?? '';
  if (!MEDIA_EXTENSIONS.has(extension)) return { ok: false, reason: 'Use a direct link to a media file (mp4, webm, mp3, ...).' };
  return { ok: true, source: { kind: 'remote', url: url.toString() } };
}

export const localReference = (fileName: string): string => `local:${fileName}`;
