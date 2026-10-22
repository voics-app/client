/** Guilds, channels (guild, DM and thread), roles, members and emojis, fed by READY and guild events. */
import { create } from 'zustand';
import { flatten, moveGuildToIndex, normalizeRail, railFromPositions, single } from '@renderer/domain/railLayout';
import type { Channel, Emoji, Guild, GuildFolder, GuildFull, GuildMember, Role } from '@shared/contracts/rest';

export type GuildMeta = Omit<GuildFull, 'channels' | 'members' | 'threads' | 'voice_states' | 'presences'>;

export interface GuildState {
  guilds: Record<string, GuildMeta>;
  /** Flat server order, always the flattened `rail`. */
  order: string[];
  /** Server rail layout: single servers and folders, in order (user settings `guild_folders`). */
  rail: GuildFolder[];
  channels: Record<string, Channel>;
  members: Record<string, Record<string, GuildMember>>;
  hydrate(guilds: GuildFull[], privateChannels: Channel[], order?: string[], folders?: GuildFolder[]): void;
  setRail(rail: GuildFolder[]): void;
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
  rail: [],
  channels: {},
  members: {},
  hydrate: (guilds, privateChannels, order, folders) =>
    set(() => {
      const ids = guilds.map((g) => g.id);
      const rail = folders?.length ? normalizeRail(folders, ids) : railFromPositions(order ?? [], ids);
      return {
        guilds: Object.fromEntries(guilds.map((g) => [g.id, meta(g)])),
        rail,
        order: flatten(rail),
        channels: Object.assign({}, ...guilds.map(indexChannels), Object.fromEntries(privateChannels.map((c) => [c.id, c]))),
        members: Object.fromEntries(guilds.map((g) => [g.id, indexMembers(g.members)])),
      };
    }),
  setRail: (rail) =>
    set((s) => {
      const next = normalizeRail(rail, Object.keys(s.guilds));
      return { rail: next, order: flatten(next) };
    }),
  upsertGuild: (guild) =>
    set((s) => ({
      guilds: { ...s.guilds, [guild.id]: meta(guild) },
      rail: s.order.includes(guild.id) ? s.rail : [...s.rail, single(guild.id)],
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
      const rail = normalizeRail(s.rail, Object.keys(guilds));
      return { guilds, members, channels, rail, order: flatten(rail) };
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
      const rail = moveGuildToIndex(s.rail, guildId, toIndex);
      return { rail, order: flatten(rail) };
    }),
  reset: () => set({ guilds: {}, order: [], rail: [], channels: {}, members: {} }),
}));
