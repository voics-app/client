import { RouteQueue } from '@renderer/application/routeQueue';
import { useSessionStore } from '@renderer/application/stores/sessionStore';
import { useGuildStore } from '@renderer/application/stores/guildStore';
import { useReadNavStore } from '@renderer/application/stores/readNavStore';
import { useUiStore } from '@renderer/application/stores/uiStore';
import { ChannelType, type Channel } from '@shared/contracts/rest';

export const isVoiceChannel = (c: Pick<Channel, 'type'>): boolean => c.type === ChannelType.GUILD_VOICE || c.type === ChannelType.GUILD_STAGE_VOICE;
export const isTextChannel = (c: Pick<Channel, 'type'>): boolean =>
  c.type === ChannelType.GUILD_TEXT || c.type === ChannelType.GUILD_ANNOUNCEMENT || c.type === ChannelType.DM || c.type === ChannelType.GROUP_DM || (c.type >= 10 && c.type <= 12);
export const isPrivateChannel = (c: Pick<Channel, 'type'>): boolean => c.type === ChannelType.DM || c.type === ChannelType.GROUP_DM;

export function openChannel(channelId: string): void {
  const channel = useGuildStore.getState().channels[channelId];
  if (!channel) return;
  if (channel.guild_id) useUiStore.getState().navigate({ kind: 'guild', guildId: channel.guild_id, channelId });
  else useUiStore.getState().navigate({ kind: 'home', channelId });
}

export function openGuild(guildId: string): void {
  const state = useGuildStore.getState();
  const ui = useUiStore.getState();
  const remembered = ui.lastChannelByGuild[guildId];
  const first = Object.values(state.channels)
    .filter((c) => c.guild_id === guildId && c.type === ChannelType.GUILD_TEXT)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))[0];
  ui.navigate({ kind: 'guild', guildId, channelId: remembered && state.channels[remembered] ? remembered : (first?.id ?? null) });
}

/** Handles `/channels/<guild|@me>/<channel>` `/invite/<code>` and `/template/<code>` routes from deep links and notifications. */
function applyRoute(route: string): void {
  const ui = useUiStore.getState();
  const channel = /^\/channels\/(@me|\d+)(?:\/(\d+))?(?:\/(\d+))?/.exec(route);
  if (channel) {
    const [, scope, channelId, messageId] = channel;
    if (channelId && messageId) useReadNavStore.getState().requestJump(channelId, messageId);
    if (scope === '@me') ui.navigate({ kind: 'home', channelId: channelId ?? null });
    else ui.navigate({ kind: 'guild', guildId: scope!, channelId: channelId ?? null });
    return;
  }
  const invite = /^\/invite\/([\w-]+)/.exec(route);
  if (invite) {
    ui.openDialog({ kind: 'joinGuild', code: invite[1] });
    return;
  }
  const template = /^\/template\/([\w-]+)/.exec(route);
  if (template) ui.openDialog({ kind: 'template', code: template[1]! });
}

const routeQueue = new RouteQueue(() => useSessionStore.getState().status === 'ready', applyRoute);

/** Deep links wait for sign-in: a signed-out user logs in first, then the route is applied. */
export function handleRoute(route: string): void {
  routeQueue.push(route);
}

/** Called when the session becomes ready to release a route received while signed out. */
export function flushPendingRoute(): void {
  routeQueue.flush();
}

export function channelIcon(type: number): 'text' | 'voice' | 'announcement' | 'forum' | 'stage' | 'thread' {
  if (type === ChannelType.GUILD_VOICE) return 'voice';
  if (type === ChannelType.GUILD_STAGE_VOICE) return 'stage';
  if (type === ChannelType.GUILD_ANNOUNCEMENT) return 'announcement';
  if (type === ChannelType.GUILD_FORUM) return 'forum';
  if (type >= 10 && type <= 12) return 'thread';
  return 'text';
}
