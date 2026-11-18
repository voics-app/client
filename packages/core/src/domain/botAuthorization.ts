/** Bot-install links support only the scopes the server implements. */
import { ALL_PERMISSIONS, Permission, type PermissionName } from '../contracts/permissions';
import { PERMISSION_CATALOG } from './permissionCatalog';
import { createI18n } from './i18n';

export interface BotAuthorizationRequest {
  client_id: string;
  scope: string;
  permissions: string;
  guild_id?: string;
}

const ALLOWED_PARAMETERS = new Set(['client_id', 'scope', 'permissions', 'guild_id']);
const snowflake = (value: string): boolean => /^[1-9]\d{0,18}$/.test(value) && BigInt(value) <= 9223372036854775807n;

export function authorizationRoute(params: URLSearchParams): string | null {
  const keys = [...params.keys()];
  if (new Set(keys).size !== keys.length || keys.some((key) => !ALLOWED_PARAMETERS.has(key))) return null;
  const client = params.get('client_id') ?? '';
  const guild = params.get('guild_id');
  const rawPermissions = params.get('permissions') ?? '0';
  const scopes = new Set((params.get('scope') ?? 'bot').split(/\s+/).filter(Boolean));
  if (!snowflake(client) || (guild !== null && !snowflake(guild))) return null;
  if (!scopes.has('bot') || [...scopes].some((scope) => scope !== 'bot' && scope !== 'applications.commands')) return null;
  if (!/^\d{1,20}$/.test(rawPermissions) || (BigInt(rawPermissions) & ~ALL_PERMISSIONS) !== 0n) return null;
  const query = new URLSearchParams({ client_id: client, scope: scopes.has('applications.commands') ? 'bot applications.commands' : 'bot', permissions: String(BigInt(rawPermissions)) });
  if (guild !== null) query.set('guild_id', guild);
  return `/oauth2/authorize?${query.toString()}`;
}

export function parseAuthorizationRoute(route: string): BotAuthorizationRequest | null {
  if (!route.startsWith('/oauth2/authorize?') || route.includes('#') || route.length > 2048) return null;
  const normalized = authorizationRoute(new URLSearchParams(route.slice('/oauth2/authorize?'.length)));
  if (!normalized) return null;
  const params = new URLSearchParams(normalized.slice('/oauth2/authorize?'.length));
  return { client_id: params.get('client_id')!, scope: params.get('scope')!, permissions: params.get('permissions')!, ...(params.has('guild_id') ? { guild_id: params.get('guild_id')! } : {}) };
}

export function permissionChecklist(permissions: string, locale?: string): { id: PermissionName; label: string }[] {
  const { catalogText } = createI18n(locale);
  const bits = BigInt(permissions);
  if ((bits & Permission.ADMINISTRATOR) !== 0n) return [{ id: 'ADMINISTRATOR', label: catalogText('Administrator — all permissions, bypassing channel restrictions') }];
  return Object.entries(Permission).filter(([, bit]) => (bits & bit) !== 0n).map(([name]) => ({
    id: name as PermissionName,
    label: catalogText(PERMISSION_CATALOG.find((entry) => entry.name === name)?.label ?? name.charAt(0) + name.slice(1).toLowerCase().replaceAll('_', ' ')),
  }));
}
