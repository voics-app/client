import { createI18n } from './i18n';
/** Pure layout logic for the server rail: ordered entries that are either a single server or a folder of servers (client#58). */
import type { GuildFolder } from '../contracts/rest';

export const MAX_FOLDER_NAME = 32;
export const FOLDER_COLORS = [0x5865f2, 0x3ba55d, 0xfaa61a, 0xed4245, 0xeb459e, 0x9b59b6, 0x1abc9c, 0x747f8d] as const;

/** A rail entry is a folder when it carries an id; otherwise it is exactly one un-foldered server. */
export const isFolder = (entry: GuildFolder): boolean => entry.id !== null;

export const single = (guildId: string): GuildFolder => ({ id: null, name: null, color: null, guild_ids: [guildId] });

export function flatten(rail: GuildFolder[]): string[] {
  return rail.flatMap((e) => e.guild_ids);
}

/** Oldest first: snowflakes are numeric strings, so a shorter id is an older one. */
function bySnowflake(a: string, b: string): number {
  return a.length - b.length || (a < b ? -1 : a > b ? 1 : 0);
}

/** Reconciles a stored layout with the servers the user is actually in: drops unknown/duplicate ids and empty folders, appends new servers. */
export function normalizeRail(rail: GuildFolder[], guildIds: string[]): GuildFolder[] {
  const known = new Set(guildIds);
  const seen = new Set<string>();
  const out: GuildFolder[] = [];
  for (const entry of rail) {
    const ids = entry.guild_ids.filter((id) => known.has(id) && !seen.has(id));
    ids.forEach((id) => seen.add(id));
    if (ids.length === 0) continue;
    out.push(entry.id === null ? single(ids[0]!) : { ...entry, guild_ids: ids });
  }
  // The gateway sends servers in no fixed order: without this the rail reshuffles on every start.
  for (const id of [...guildIds].sort(bySnowflake)) if (!seen.has(id)) out.push(single(id));
  return out;
}

/** A newly chosen layout over the loaded servers, plus the saved places of servers not loaded yet, so a partial session start never erases them. */
export function mergeSavedRail(next: GuildFolder[], previousSaved: GuildFolder[], loadedIds: string[]): GuildFolder[] {
  const loaded = new Set(loadedIds);
  const placed = new Set(flatten(next));
  const pending = previousSaved
    .map((e) => ({ ...e, guild_ids: e.guild_ids.filter((id) => !loaded.has(id) && !placed.has(id)) }))
    .filter((e) => e.guild_ids.length > 0);
  return [...next, ...pending];
}

function without(rail: GuildFolder[], guildId: string): GuildFolder[] {
  return rail
    .map((e) => ({ ...e, guild_ids: e.guild_ids.filter((id) => id !== guildId) }))
    .filter((e) => e.guild_ids.length > 0);
}

export function nextFolderId(rail: GuildFolder[]): number {
  return rail.reduce((max, e) => Math.max(max, e.id ?? 0), 0) + 1;
}

/** Moves a server out of wherever it is and places it as a single entry at `index` (index counted over the rail without it). */
export function moveGuildToIndex(rail: GuildFolder[], guildId: string, index: number): GuildFolder[] {
  const rest = without(rail, guildId);
  rest.splice(Math.max(0, Math.min(index, rest.length)), 0, single(guildId));
  return rest;
}

/** Drops a server onto another: forms a new folder (target first) or joins the target's folder. */
export function dropOnto(rail: GuildFolder[], draggedId: string, targetId: string, folderId = nextFolderId(rail)): GuildFolder[] {
  if (draggedId === targetId) return rail;
  const target = rail.find((e) => e.guild_ids.includes(targetId));
  if (!target) return rail;
  const rest = without(rail, draggedId);
  return rest.map((e) => {
    if (!e.guild_ids.includes(targetId)) return e;
    if (isFolder(e)) return { ...e, guild_ids: [...e.guild_ids, draggedId] };
    return { id: folderId, name: null, color: null, guild_ids: [targetId, draggedId] };
  });
}

/** Drops a server into a folder at a position within it. */
export function moveIntoFolder(rail: GuildFolder[], guildId: string, folderId: number, index: number): GuildFolder[] {
  const rest = without(rail, guildId);
  return rest.map((e) => {
    if (e.id !== folderId) return e;
    const ids = [...e.guild_ids];
    ids.splice(Math.max(0, Math.min(index, ids.length)), 0, guildId);
    return { ...e, guild_ids: ids };
  });
}

/** Moves a whole folder to an index in the rail. */
export function moveFolder(rail: GuildFolder[], folderId: number, index: number): GuildFolder[] {
  const folder = rail.find((e) => e.id === folderId);
  if (!folder) return rail;
  const rest = rail.filter((e) => e !== folder);
  rest.splice(Math.max(0, Math.min(index, rest.length)), 0, folder);
  return rest;
}

export function patchFolder(rail: GuildFolder[], folderId: number, patch: Partial<Pick<GuildFolder, 'name' | 'color'>>): GuildFolder[] {
  return rail.map((e) => {
    if (e.id !== folderId) return e;
    const name = patch.name === undefined ? e.name : patch.name?.trim().slice(0, MAX_FOLDER_NAME) || null;
    return { ...e, name, color: patch.color === undefined ? e.color : patch.color };
  });
}

/** Dissolves a folder, keeping its servers in place as single entries. */
export function ungroup(rail: GuildFolder[], folderId: number): GuildFolder[] {
  return rail.flatMap((e) => (e.id === folderId ? e.guild_ids.map(single) : [e]));
}

/** A folder of one server is not kept: it reverts to a plain entry. */
export function collapseSingletons(rail: GuildFolder[]): GuildFolder[] {
  return rail.map((e) => (isFolder(e) && e.guild_ids.length === 1 ? single(e.guild_ids[0]!) : e));
}

export function folderLabel(folder: GuildFolder, guildName: (id: string) => string | undefined, locale?: string): string {
  return folder.name || folder.guild_ids.map(guildName).filter(Boolean).join(', ') || createI18n(locale).catalogText('Folder');
}

export type DragItem = { kind: 'guild'; id: string } | { kind: 'folder'; id: number };
export type DropZone = 'before' | 'after' | 'onto';

/** Index of the top-level entry holding the target. */
function entryIndex(rail: GuildFolder[], target: DragItem): number {
  return rail.findIndex((e) => (target.kind === 'folder' ? e.id === target.id : e.guild_ids.includes(target.id)));
}

/** Resolves a drag-and-drop gesture on the rail into the new layout. */
export function applyDrop(rail: GuildFolder[], drag: DragItem, target: DragItem, zone: DropZone): GuildFolder[] {
  if (drag.kind === target.kind && drag.id === target.id) return rail;
  const at = entryIndex(rail, target);
  if (at < 0) return rail;
  const entry = rail[at]!;
  let next: GuildFolder[];
  if (drag.kind === 'folder') {
    if (target.kind === 'guild' && entry.id === drag.id) return rail;
    const without = rail.filter((e) => e.id !== drag.id);
    const rel = entryIndex(without, target);
    next = moveFolder(rail, drag.id, rel + (zone === 'before' ? 0 : 1));
  } else if (target.kind === 'folder') {
    if (zone === 'onto') next = moveIntoFolder(rail, drag.id, target.id, Number.MAX_SAFE_INTEGER);
    else {
      const rest = without(rail, drag.id);
      next = moveGuildToIndex(rail, drag.id, entryIndex(rest, target) + (zone === 'before' ? 0 : 1));
    }
  } else if (zone === 'onto') {
    next = dropOnto(rail, drag.id, target.id);
  } else if (isFolder(entry)) {
    const rest = without(rail, drag.id);
    const folder = rest.find((e) => e.id === entry.id);
    const idx = (folder?.guild_ids.indexOf(target.id) ?? 0) + (zone === 'before' ? 0 : 1);
    next = moveIntoFolder(rail, drag.id, entry.id!, idx);
  } else {
    const rest = without(rail, drag.id);
    next = moveGuildToIndex(rail, drag.id, entryIndex(rest, target) + (zone === 'before' ? 0 : 1));
  }
  return collapseSingletons(next);
}
