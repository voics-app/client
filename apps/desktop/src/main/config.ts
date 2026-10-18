/**
 * Connection and update configuration. Precedence: environment variables >
 * persisted user choice (Settings → Connection) > production defaults.
 */
import type { ConnectionProfile, ConnectionProfileId } from '../shared/ipc';
import { BRAND } from '../shared/brand';

export const DEFAULT_UPDATE_FEED_URL = BRAND.updateFeedHost;

export const PROFILES: Record<Exclude<ConnectionProfileId, 'custom'>, ConnectionProfile> = {
  production: {
    id: 'production',
    apiUrl: 'https://discordy-api.voics.nl',
    gatewayUrl: 'wss://discordy-gateway.voics.nl',
    cdnUrl: 'https://discordy-cdn.voics.nl',
  },
  local: {
    id: 'local',
    apiUrl: 'http://localhost:8000',
    gatewayUrl: 'ws://localhost:8000',
    cdnUrl: 'http://localhost:8000/cdn',
  },
};

export type Env = Partial<Record<string, string>>;

function validUrl(name: string, value: string, schemes: readonly string[]): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} is not a valid URL: ${value}`);
  }
  if (!schemes.includes(parsed.protocol)) {
    throw new Error(`${name} must use one of ${schemes.join(', ')} (got ${parsed.protocol})`);
  }
  return value.replace(/\/+$/, '');
}

export function validateProfile(profile: ConnectionProfile): ConnectionProfile {
  return {
    id: profile.id,
    apiUrl: validUrl('apiUrl', profile.apiUrl, ['http:', 'https:']),
    gatewayUrl: validUrl('gatewayUrl', profile.gatewayUrl, ['ws:', 'wss:']),
    cdnUrl: validUrl('cdnUrl', profile.cdnUrl, ['http:', 'https:']),
  };
}

export function resolveConnection(env: Env, persisted: ConnectionProfile | null): ConnectionProfile {
  const named = env.DISCORDY_PROFILE;
  const base: ConnectionProfile =
    named === 'local' || named === 'production' ? PROFILES[named] : (persisted ?? PROFILES.production);

  const overrides = {
    apiUrl: env.DISCORDY_API_URL ? validUrl('DISCORDY_API_URL', env.DISCORDY_API_URL, ['http:', 'https:']) : undefined,
    gatewayUrl: env.DISCORDY_GATEWAY_URL
      ? validUrl('DISCORDY_GATEWAY_URL', env.DISCORDY_GATEWAY_URL, ['ws:', 'wss:'])
      : undefined,
    cdnUrl: env.DISCORDY_CDN_URL ? validUrl('DISCORDY_CDN_URL', env.DISCORDY_CDN_URL, ['http:', 'https:']) : undefined,
  };
  const overridden = Object.values(overrides).some(Boolean);
  if (!overridden) return base;
  return {
    id: 'custom',
    apiUrl: overrides.apiUrl ?? base.apiUrl,
    gatewayUrl: overrides.gatewayUrl ?? base.gatewayUrl,
    cdnUrl: overrides.cdnUrl ?? base.cdnUrl,
  };
}

export function resolveUpdateFeed(env: Env): string {
  return env.UPDATE_FEED_URL ? validUrl('UPDATE_FEED_URL', env.UPDATE_FEED_URL, ['http:', 'https:']) : DEFAULT_UPDATE_FEED_URL;
}
