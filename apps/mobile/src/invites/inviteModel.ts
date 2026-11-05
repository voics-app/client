import { ChannelType, type Channel, type Invite } from '@discordy/core/contracts/rest';

/** The same choices the desktop invite dialog offers. */
export const EXPIRY_OPTIONS = [
  { value: 1800, label: '30 minutes' },
  { value: 3600, label: '1 hour' },
  { value: 86400, label: '1 day' },
  { value: 604800, label: '7 days' },
  { value: 0, label: 'Never' },
] as const;

export const MAX_USES_OPTIONS = [
  { value: 0, label: 'No limit' },
  { value: 1, label: '1 use' },
  { value: 5, label: '5 uses' },
  { value: 25, label: '25 uses' },
  { value: 100, label: '100 uses' },
] as const;

export const DEFAULT_EXPIRY = 86400;
export const DEFAULT_MAX_USES = 0;

/** The channel an invite is created through: the server's first text channel, as the desktop menu does. */
export function inviteChannelId(channels: Record<string, Channel>, guildId: string): string | null {
  const first = Object.values(channels)
    .filter((c) => c.guild_id === guildId && c.type === ChannelType.GUILD_TEXT)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.id.localeCompare(b.id))[0];
  return first?.id ?? null;
}

/** One line under an invite code: who made it, how often it was used and when it ends. */
export function inviteSummary(invite: Invite, inviterName: string | null): string {
  const uses = `${invite.uses ?? 0}${invite.max_uses ? `/${invite.max_uses}` : ''} uses`;
  const ends = invite.expires_at ? `expires ${new Date(invite.expires_at).toLocaleString()}` : 'never expires';
  return [inviterName ? `by ${inviterName}` : null, uses, ends].filter(Boolean).join(' · ');
}
