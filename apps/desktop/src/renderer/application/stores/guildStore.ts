/** Guilds, channels (guild, DM and thread), roles, members and emojis, fed by READY and guild events. */
import { create } from 'zustand';
import type { Channel, Emoji, Guild, GuildFull, GuildMember, Role } from '@shared/contracts/rest';

export type GuildMeta = Omit<GuildFull, 'channels' | 'members' | 'threads' | 'voice_states' | 'presences'>;

export interface GuildState {
  guilds: Record<string, GuildMeta>;
  order: string[];
  channels: Record<string, Channel>;
  members: Record<string, Record<string, GuildMember>>;
  hydrate(guilds: GuildFull[], privateChannels: Channel[], order?: string[]): void;
  upsertGuild(guild: GuildFull): void;
  patchGuild(guild: Partial<Guild> & { id: string }): void;
  removeGuild(guildId: string): void;
  upsertChannel(channel: Channel): void;
  removeChannel(channelId: string): void;
  upsertRole(guildId: string, role: Role): void;
  removeRole(guildId: string, roleId: string): void;
  upsertMember(guildId: string, member: GuildMember): void;
  upsertMembers(guildId: string, members: GuildMember[]): void;
  removeMember(guildId: string, userId: string): void;
  setEmojis(guildId: string, emojis: Emoji[]): void;
  moveGuild(guildId: string, toIndex: number): void;
  reset(): void;
}

function meta(guild: GuildFull): GuildMeta {
  const { channels: _c, members: _m, threads: _t, voice_states: _v, presences: _p, ...rest } = guild;
  return rest;
}

function indexMembers(members: GuildMember[]): Record<string, GuildMember> {
  return Object.fromEntries(members.map((m) => [m.user.id, m]));
}

function indexChannels(guild: GuildFull): Record<string, Channel> {
  return Object.fromEntries(
    [...guild.channels, ...(guild.threads ?? [])].map((c) => [c.id, { ...c, guild_id: c.guild_id ?? guild.id }]),
  );
}

export const useGuildStore = create<GuildState>((set) => ({
  guilds: {},
  order: [],
  channels: {},
  members: {},
  hydrate: (guilds, privateChannels, order) =>
    set(() => {
      const ids = guilds.map((g) => g.id);
      const sorted = order ? [...order.filter((id) => ids.includes(id)), ...ids.filter((id) => !order.includes(id))] : ids;
      return {
        guilds: Object.fromEntries(guilds.map((g) => [g.id, meta(g)])),
        order: sorted,
        channels: Object.assign({}, ...guilds.map(indexChannels), Object.fromEntries(privateChannels.map((c) => [c.id, c]))),
        members: Object.fromEntries(guilds.map((g) => [g.id, indexMembers(g.members)])),
      };
    }),
  upsertGuild: (guild) =>
    set((s) => ({
      guilds: { ...s.guilds, [guild.id]: meta(guild) },
      order: s.order.includes(guild.id) ? s.order : [...s.order, guild.id],
      channels: { ...s.channels, ...indexChannels(guild) },
      members: { ...s.members, [guild.id]: { ...(s.members[guild.id] ?? {}), ...indexMembers(guild.members ?? []) } },
    })),
  patchGuild: (guild) =>
    set((s) => {
      const existing = s.guilds[guild.id];
      return existing ? { guilds: { ...s.guilds, [guild.id]: { ...existing, ...guild } } } : {};
    }),
  removeGuild: (guildId) =>
    set((s) => {
      const { [guildId]: _g, ...guilds } = s.guilds;
      const { [guildId]: _m, ...members } = s.members;
      const channels = Object.fromEntries(Object.entries(s.channels).filter(([, c]) => c.guild_id !== guildId));
      return { guilds, members, channels, order: s.order.filter((id) => id !== guildId) };
    }),
  upsertChannel: (channel) => set((s) => ({ channels: { ...s.channels, [channel.id]: { ...s.channels[channel.id], ...channel } } })),
  removeChannel: (channelId) =>
    set((s) => {
      const { [channelId]: _removed, ...channels } = s.channels;
      return { channels };
    }),
  upsertRole: (guildId, role) =>
    set((s) => {
      const guild = s.guilds[guildId];
      if (!guild) return {};
      const roles = guild.roles.some((r) => r.id === role.id) ? guild.roles.map((r) => (r.id === role.id ? role : r)) : [...guild.roles, role];
      return { guilds: { ...s.guilds, [guildId]: { ...guild, roles } } };
    }),
  removeRole: (guildId, roleId) =>
    set((s) => {
      const guild = s.guilds[guildId];
      if (!guild) return {};
      return { guilds: { ...s.guilds, [guildId]: { ...guild, roles: guild.roles.filter((r) => r.id !== roleId) } } };
    }),
  upsertMember: (guildId, member) =>
    set((s) => ({ members: { ...s.members, [guildId]: { ...(s.members[guildId] ?? {}), [member.user.id]: member } } })),
  upsertMembers: (guildId, members) =>
    set((s) => ({ members: { ...s.members, [guildId]: { ...(s.members[guildId] ?? {}), ...indexMembers(members) } } })),
  removeMember: (guildId, userId) =>
    set((s) => {
      const { [userId]: _removed, ...rest } = s.members[guildId] ?? {};
      return { members: { ...s.members, [guildId]: rest } };
    }),
  setEmojis: (guildId, emojis) =>
    set((s) => {
      const guild = s.guilds[guildId];
      return guild ? { guilds: { ...s.guilds, [guildId]: { ...guild, emojis } } } : {};
    }),
  moveGuild: (guildId, toIndex) =>
    set((s) => {
      const order = s.order.filter((id) => id !== guildId);
      order.splice(Math.max(0, Math.min(toIndex, order.length)), 0, guildId);
      return { order };
    }),
  reset: () => set({ guilds: {}, order: [], channels: {}, members: {} }),
}));
