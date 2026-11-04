/** Pure ordering logic for the channel list: drag-and-drop and Move up/down produce a new layout, `diffMoves` turns it into a bulk PATCH body (client#59). */
import { ChannelType, type Channel, type PermissionOverwrite } from '../contracts/rest';

export interface CategoryGroup {
  id: string;
  children: string[];
}

/** Channels without a category, then categories in order, each with its children in order. */
export interface ChannelLayout {
  loose: string[];
  categories: CategoryGroup[];
}

export interface ChannelMove {
  id: string;
  position: number;
  /** Present only when the parent changes; `null` moves the channel out of its category. */
  parent_id?: string | null;
  lock_permissions?: boolean;
}

/** Where a channel lands: in a category (`parent` id) or at the top level (`null`), at `index` among that group's channels. */
export interface ChannelTarget {
  parent: string | null;
  index: number;
}

const byOrder = (a: Channel, b: Channel) => (a.position ?? 0) - (b.position ?? 0) || a.id.localeCompare(b.id);

/** Threads (types 10-12) are not part of the sidebar order. */
export const isListed = (c: Channel) => !(c.type >= 10 && c.type <= 12);

export function layoutOf(channels: Channel[]): ChannelLayout {
  const listed = channels.filter(isListed).sort(byOrder);
  const categories = listed.filter((c) => c.type === ChannelType.GUILD_CATEGORY);
  const ids = new Set(categories.map((c) => c.id));
  const members = (parent: string | null) =>
    listed.filter((c) => c.type !== ChannelType.GUILD_CATEGORY && (parent === null ? !c.parent_id || !ids.has(c.parent_id) : c.parent_id === parent)).map((c) => c.id);
  return { loose: members(null), categories: categories.map((c) => ({ id: c.id, children: members(c.id) })) };
}

function clamp(index: number, length: number): number {
  return Math.max(0, Math.min(index, length));
}

function removeChannel(layout: ChannelLayout, id: string): ChannelLayout {
  return {
    loose: layout.loose.filter((c) => c !== id),
    categories: layout.categories.map((g) => ({ ...g, children: g.children.filter((c) => c !== id) })),
  };
}

/** Moves a non-category channel. `target.index` counts within the destination group after the channel has been taken out. */
export function moveChannel(layout: ChannelLayout, id: string, target: ChannelTarget): ChannelLayout {
  if (target.parent !== null && !layout.categories.some((g) => g.id === target.parent)) return layout;
  const rest = removeChannel(layout, id);
  if (target.parent === null) {
    const loose = [...rest.loose];
    loose.splice(clamp(target.index, loose.length), 0, id);
    return { ...rest, loose };
  }
  return {
    ...rest,
    categories: rest.categories.map((g) => {
      if (g.id !== target.parent) return g;
      const children = [...g.children];
      children.splice(clamp(target.index, children.length), 0, id);
      return { ...g, children };
    }),
  };
}

/** Moves a category to `index` among the categories (counted without it). Categories never nest. */
export function moveCategory(layout: ChannelLayout, id: string, index: number): ChannelLayout {
  const group = layout.categories.find((g) => g.id === id);
  if (!group) return layout;
  const rest = layout.categories.filter((g) => g !== group);
  rest.splice(clamp(index, rest.length), 0, group);
  return { ...layout, categories: rest };
}

/** Keyboard alternative: one step up/down. A channel at the edge of its category continues into the neighbouring one. */
export function stepChannel(layout: ChannelLayout, id: string, direction: -1 | 1): ChannelLayout {
  const groups: { parent: string | null; ids: string[] }[] = [
    { parent: null, ids: layout.loose },
    ...layout.categories.map((g) => ({ parent: g.id, ids: g.children })),
  ];
  const at = groups.findIndex((g) => g.ids.includes(id));
  if (at < 0) return layout;
  const group = groups[at]!;
  const i = group.ids.indexOf(id);
  const j = i + direction;
  if (j >= 0 && j < group.ids.length) return moveChannel(layout, id, { parent: group.parent, index: j });
  const next = groups[at + direction];
  if (!next) return layout;
  // Entering the neighbouring group from above lands first, from below lands last.
  return moveChannel(layout, id, { parent: next.parent, index: direction === 1 ? 0 : next.ids.length });
}

export function stepCategory(layout: ChannelLayout, id: string, direction: -1 | 1): ChannelLayout {
  const i = layout.categories.findIndex((g) => g.id === id);
  if (i < 0) return layout;
  return moveCategory(layout, id, i + direction);
}

export interface SyncOptions {
  /** Channel that should also take over its new category's permissions. */
  lockPermissionsFor?: string;
}

/** Bulk-PATCH entries for every channel whose position or parent differs from the current state. */
export function diffMoves(channels: Channel[], layout: ChannelLayout, options: SyncOptions = {}): ChannelMove[] {
  const byId = new Map(channels.map((c) => [c.id, c]));
  const moves: ChannelMove[] = [];
  const push = (id: string, position: number, parent: string | null | undefined) => {
    const current = byId.get(id);
    if (!current) return;
    const parentChanged = parent !== undefined && (current.parent_id ?? null) !== parent;
    if ((current.position ?? 0) === position && !parentChanged) return;
    moves.push({
      id,
      position,
      ...(parentChanged ? { parent_id: parent } : {}),
      ...(parentChanged && parent !== null && options.lockPermissionsFor === id ? { lock_permissions: true } : {}),
    });
  };
  layout.loose.forEach((id, i) => push(id, i, null));
  layout.categories.forEach((g, i) => {
    push(g.id, i, undefined);
    g.children.forEach((id, k) => push(id, k, g.id));
  });
  return moves;
}

/** The channel's category changed (to a real category) by this layout change. */
export function newParentOf(channels: Channel[], layout: ChannelLayout, id: string): string | null {
  const current = channels.find((c) => c.id === id)?.parent_id ?? null;
  const now = layout.categories.find((g) => g.children.includes(id))?.id ?? null;
  return now !== null && now !== current ? now : null;
}

const key = (o: PermissionOverwrite) => `${o.type}:${o.id}:${o.allow}:${o.deny}`;

export function overwritesDiffer(a: PermissionOverwrite[] | undefined, b: PermissionOverwrite[] | undefined): boolean {
  const left = (a ?? []).map(key).sort();
  const right = (b ?? []).map(key).sort();
  return left.length !== right.length || left.some((k, i) => k !== right[i]);
}

export type ChannelDrag = { kind: 'channel' | 'category'; id: string };
/** `before`/`after` are relative to the hovered row or category; `start` is the category header, `end` the empty space of a category (or the top-level group, `id` = `LOOSE`). */
export type ChannelDropZone = 'before' | 'after' | 'start' | 'end';
export const LOOSE = '__loose__';

function groupOf(layout: ChannelLayout, id: string): { parent: string | null; ids: string[] } | null {
  if (layout.loose.includes(id)) return { parent: null, ids: layout.loose };
  const g = layout.categories.find((c) => c.children.includes(id));
  return g ? { parent: g.id, ids: g.children } : null;
}

/** Turns a drop gesture into the new layout; invalid drops (a category inside another, onto itself) return the layout unchanged. */
export function resolveDrop(layout: ChannelLayout, drag: ChannelDrag, target: ChannelDrag, zone: ChannelDropZone): ChannelLayout {
  if (drag.id === target.id) return layout;
  if (drag.kind === 'category') {
    if (target.kind !== 'category') return layout;
    const rest = layout.categories.filter((g) => g.id !== drag.id);
    const at = rest.findIndex((g) => g.id === target.id);
    if (at < 0) return layout;
    return moveCategory(layout, drag.id, at + (zone === 'after' ? 1 : 0));
  }
  if (target.kind === 'category') {
    if (target.id === LOOSE) return moveChannel(layout, drag.id, { parent: null, index: Number.MAX_SAFE_INTEGER });
    return moveChannel(layout, drag.id, { parent: target.id, index: zone === 'start' ? 0 : Number.MAX_SAFE_INTEGER });
  }
  const group = groupOf(layout, target.id);
  if (!group) return layout;
  const ids = group.ids.filter((c) => c !== drag.id);
  return moveChannel(layout, drag.id, { parent: group.parent, index: ids.indexOf(target.id) + (zone === 'after' ? 1 : 0) });
}
