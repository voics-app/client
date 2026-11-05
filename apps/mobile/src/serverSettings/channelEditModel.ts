import { ChannelType, type Channel, type PermissionOverwrite } from '@discordy/core/contracts/rest';

/** Slowmode steps desktop's channel settings offer, in seconds. */
export const SLOWMODE_OPTIONS = [
  { value: 0, label: 'Off' },
  { value: 5, label: '5s' },
  { value: 30, label: '30s' },
  { value: 300, label: '5m' },
  { value: 3600, label: '1h' },
] as const;

export const TOPIC_MAX = 1024;

export const isVoiceChannel = (channel: Pick<Channel, 'type'>): boolean => channel.type === ChannelType.GUILD_VOICE || channel.type === ChannelType.GUILD_STAGE_VOICE;

export interface ChannelDraft {
  name: string;
  topic: string;
  slowmode: number;
  nsfw: boolean;
  /** Voice only. */
  userLimit: number;
  /** Voice only, in kbps. */
  bitrateKbps: number;
}

export const draftOfChannel = (channel: Channel): ChannelDraft => ({
  name: channel.name ?? '',
  topic: channel.topic ?? '',
  slowmode: channel.rate_limit_per_user ?? 0,
  nsfw: channel.nsfw ?? false,
  userLimit: channel.user_limit ?? 0,
  bitrateKbps: Math.round((channel.bitrate ?? 64000) / 1000),
});

const clamp = (value: number, min: number, max: number, fallback: number) => Math.max(min, Math.min(max, Math.floor(value) || fallback));

/** The update desktop's channel Overview sends (name, topic, age restriction, and either slowmode or the voice limits); null when nothing changed. */
export function channelPatch(channel: Channel, draft: ChannelDraft): Record<string, unknown> | null {
  const voice = isVoiceChannel(channel);
  const saved = draftOfChannel(channel);
  const name = draft.name.trim().toLowerCase().replace(/\s+/g, '-');
  const changed = name !== saved.name || draft.nsfw !== saved.nsfw || (!voice && (draft.topic !== saved.topic || draft.slowmode !== saved.slowmode)) || (voice && (draft.userLimit !== saved.userLimit || draft.bitrateKbps !== saved.bitrateKbps));
  if (!changed || name === '') return null;
  return {
    name,
    nsfw: draft.nsfw,
    ...(voice ? { user_limit: clamp(draft.userLimit, 0, 99, 0), bitrate: clamp(draft.bitrateKbps, 8, 384, 64) * 1000 } : { topic: draft.topic || null, rate_limit_per_user: draft.slowmode }),
  };
}

export interface OverwriteChanges {
  put: PermissionOverwrite[];
  remove: string[];
}

/** What to send to turn the saved overwrites into the draft: changed or new ones are put, dropped ones deleted. */
export function overwriteChanges(saved: readonly PermissionOverwrite[], draft: readonly PermissionOverwrite[]): OverwriteChanges {
  return {
    put: draft.filter((o) => {
      const before = saved.find((x) => x.id === o.id);
      return !before || before.allow !== o.allow || before.deny !== o.deny;
    }),
    remove: saved.filter((o) => !draft.some((x) => x.id === o.id)).map((o) => o.id),
  };
}
