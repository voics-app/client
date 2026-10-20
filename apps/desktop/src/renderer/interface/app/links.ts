import { bridge } from './bridge';

/** Opens an http(s) URL in the system browser. Other schemes are ignored. */
export function openExternalUrl(url: string): void {
  if (!/^https?:\/\//i.test(url)) return;
  if (bridge) void bridge.app.openExternal(url);
  else window.open(url, '_blank', 'noopener,noreferrer');
}

export function googleSearchUrl(text: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(text.trim().slice(0, 300))}`;
}
