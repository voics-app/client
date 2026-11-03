/** Content-Security-Policy for the renderer, derived from the active connection profile. */
import type { ConnectionProfile } from '../shared/ipc';
import { BRAND } from '../shared/brand';

function originOf(url: string): string {
  const u = new URL(url);
  return `${u.protocol}//${u.host}`;
}

export function buildCsp(profile: ConnectionProfile, devServer: string | null): string {
  const endpoints = [profile.apiUrl, profile.gatewayUrl, profile.cdnUrl].map(originOf);
  const local = endpoints.some((e) => /\/\/(localhost|127\.0\.0\.1)(:|$)/.test(e));
  const connect = [
    "'self'",
    ...endpoints,
    `wss://*.${BRAND.baseDomain}`,
    `https://*.${BRAND.baseDomain}`,
    ...(local ? ['ws://localhost:*', 'http://localhost:*', 'ws://127.0.0.1:*', 'http://127.0.0.1:*'] : []),
    ...(devServer ? [originOf(devServer), originOf(devServer).replace(/^http/, 'ws')] : []),
  ];
  const scriptSrc = devServer ? `'self' 'unsafe-inline' ${originOf(devServer)}` : "'self'";
  return [
    "default-src 'self'",
    `script-src ${scriptSrc} 'wasm-unsafe-eval'`,
    "worker-src 'self' blob:",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    `img-src 'self' data: blob: https: ${local ? 'http://localhost:* http://127.0.0.1:*' : ''}`.trim(),
    `media-src ${["'self'", 'blob:', 'https:', 'mediastream:', ...(local ? ['http://localhost:*', 'http://127.0.0.1:*'] : [])].join(' ')}`,
    `connect-src ${[...new Set(connect)].join(' ')}`,
    'frame-src https://www.youtube-nocookie.com https://player.vimeo.com',
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
}
