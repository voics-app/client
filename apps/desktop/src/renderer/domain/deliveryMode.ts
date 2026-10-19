/** Delivery-mode rules (P11), mirrored client-side for the composer badge and settings UI. */
import type { DeliveryMode } from '@shared/contracts/rest';
import { BRAND } from '@shared/brand';

const STRICTNESS: Record<DeliveryMode, number> = { standard: 0, ephemeral: 1, p2p: 2 };
export const DELIVERY_MODES: readonly DeliveryMode[] = ['standard', 'ephemeral', 'p2p'];

export const EPHEMERAL_GUILD_MEMBER_LIMIT = 100;
export const P2P_GROUP_LIMIT = 10;

export function stricterMode(a: DeliveryMode, b: DeliveryMode): DeliveryMode {
  return STRICTNESS[a] >= STRICTNESS[b] ? a : b;
}

export interface ParticipantModeSetting {
  override: DeliveryMode | null;
  accountDefault: DeliveryMode;
}

export interface ModeResolutionInput {
  guildId: string | null;
  channelMode: DeliveryMode;
  participants: readonly ParticipantModeSetting[];
}

export function effectiveDeliveryMode(input: ModeResolutionInput): DeliveryMode {
  if (input.guildId) return input.channelMode;
  const strictest = input.participants.reduce<DeliveryMode>(
    (mode, p) => stricterMode(mode, p.override ?? p.accountDefault),
    'standard',
  );
  if (strictest === 'p2p' && input.participants.length > P2P_GROUP_LIMIT) return 'ephemeral';
  return strictest;
}

export interface ChannelScope {
  isGuild: boolean;
  memberCount: number;
}

/** Returns a human-readable reason when the mode is not allowed, or null when it is. */
export function validateModeForChannel(mode: DeliveryMode, scope: ChannelScope): string | null {
  if (mode === 'p2p' && scope.isGuild) return 'P2P is only available in DMs and small group DMs, not guild channels.';
  if (mode === 'p2p' && scope.memberCount > P2P_GROUP_LIMIT)
    return `P2P supports at most ${P2P_GROUP_LIMIT} participants.`;
  if (mode === 'ephemeral' && scope.isGuild && scope.memberCount > EPHEMERAL_GUILD_MEMBER_LIMIT)
    return `Ephemeral is limited to channels with at most ${EPHEMERAL_GUILD_MEMBER_LIMIT} members.`;
  return null;
}

export const DEVICE_UNREGISTERED_REASON =
  'Encrypted modes are unavailable on this device. Check Settings > Devices, then sign in again.';

/** Encrypted modes need this device registered with the server; standard mode never does. */
export function validateModeForDevice(mode: DeliveryMode, deviceRegistered: boolean): string | null {
  return mode === 'standard' || deviceRegistered ? null : DEVICE_UNREGISTERED_REASON;
}

export function availableModes(scope: ChannelScope): DeliveryMode[] {
  return DELIVERY_MODES.filter((m) => validateModeForChannel(m, scope) === null);
}

export const MODE_COPY: Record<DeliveryMode, { label: string; short: string; description: string }> = {
  standard: {
    label: 'Standard',
    short: 'Standard',
    description: `Stored on ${BRAND.displayName} servers. History syncs across devices; bots and embeds work.`,
  },
  ephemeral: {
    label: 'Ephemeral E2EE',
    short: 'E2EE',
    description: 'End-to-end encrypted with MLS. The server relays ciphertext and deletes it once your device receives it.',
  },
  p2p: {
    label: 'Peer-to-peer',
    short: 'P2P',
    description: 'Sent directly between devices over WebRTC. Nothing is stored on any server; the peer must be online.',
  },
};
