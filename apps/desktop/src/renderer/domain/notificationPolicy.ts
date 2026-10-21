/** Pure notification rules: who counts as mentioned, and whether a desktop notification fires. */

export type NotifyLevel = 'all' | 'mentions' | 'none';

export interface PolicyMessage {
  guild_id?: string | null;
  mentions: readonly { id: string }[];
  mention_roles?: readonly string[];
  mention_everyone: boolean;
}

export interface MentionContext {
  meId: string;
  /** Role ids of the viewer in the message's guild. */
  myRoleIds: readonly string[];
  /** Suppress @everyone / @here pings (per-server setting). */
  suppressEveryone?: boolean;
  /** Suppress mentions of the viewer's roles (per-server setting). */
  suppressRoles?: boolean;
}

/** DMs, direct @user mentions, mentions of one of the viewer's roles, and @everyone/@here (unless suppressed). */
export function isMentioned(message: PolicyMessage, ctx: MentionContext): boolean {
  if (!message.guild_id) return true;
  if (message.mentions.some((u) => u.id === ctx.meId)) return true;
  if (!ctx.suppressRoles && message.mention_roles?.some((r) => ctx.myRoleIds.includes(r))) return true;
  return message.mention_everyone && !ctx.suppressEveryone;
}

export interface NotifyInput {
  mentioned: boolean;
  level: NotifyLevel;
  muted: boolean;
  /** The window is focused on the message's channel. */
  viewingChannel: boolean;
  desktopEnabled: boolean;
  doNotDisturb: boolean;
}

export function shouldNotify(input: NotifyInput): boolean {
  if (!input.desktopEnabled || input.doNotDisturb || input.muted || input.viewingChannel) return false;
  if (input.level === 'none') return false;
  if (input.level === 'mentions') return input.mentioned;
  return true;
}

export function levelFromPrefs(onlyMentions: boolean): NotifyLevel {
  return onlyMentions ? 'mentions' : 'all';
}
