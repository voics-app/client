export interface ActivityFacts {
  id: string;
  muted: boolean;
  unread: boolean;
  mentions: number;
  /** Voice channel with people in it. */
  occupied: boolean;
}

/** A channel that has something going on and so stays visible inside a collapsed category. */
export function hasActivity(c: ActivityFacts, activeId: string | null | undefined): boolean {
  if (c.id === activeId) return true;
  if (c.mentions > 0) return true;
  if (c.occupied) return true;
  return !c.muted && c.unread;
}

/** Channels of a category that remain listed: all of them when expanded, only the active ones when collapsed. */
export function visibleChannelIds(children: ActivityFacts[], collapsed: boolean, activeId: string | null | undefined): Set<string> {
  return new Set(children.filter((c) => !collapsed || hasActivity(c, activeId)).map((c) => c.id));
}

export interface RowBox {
  id: string;
  top: number;
  bottom: number;
}

export interface MentionPill {
  /** Nearest mention row above the viewport, or null. */
  above: string | null;
  /** Nearest mention row below the viewport, or null. */
  below: string | null;
}

/** Given the rows that carry mentions and the scroll viewport, finds the nearest off-screen ones in each direction. */
export function offscreenMentions(rows: RowBox[], viewport: { top: number; bottom: number }): MentionPill {
  let above: RowBox | null = null;
  let below: RowBox | null = null;
  for (const r of rows) {
    if (r.bottom <= viewport.top) {
      if (!above || r.bottom > above.bottom) above = r;
    } else if (r.top >= viewport.bottom) {
      if (!below || r.top < below.top) below = r;
    }
  }
  return { above: above?.id ?? null, below: below?.id ?? null };
}

const VIEW_CHANNEL = 1n << 10n;

/** True when the channel hides itself from @everyone through its overwrites (the role id of @everyone equals the guild id). */
export function isPrivateChannel(channel: { guild_id?: string | null; permission_overwrites?: { id: string; type: number; deny: string }[] }): boolean {
  if (!channel.guild_id) return false;
  return (channel.permission_overwrites ?? []).some((o) => o.type === 0 && o.id === channel.guild_id && (BigInt(o.deny || "0") & VIEW_CHANNEL) !== 0n);
}
