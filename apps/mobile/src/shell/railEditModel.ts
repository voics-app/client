import type { GuildFolder } from '@discordy/core/contracts/rest';
import { collapseSingletons, dropOnto, isFolder, moveFolder, moveGuildToIndex, moveIntoFolder, ungroup } from '@discordy/core/domain/railLayout';

const topIndex = (rail: GuildFolder[], guildId: string) => rail.findIndex((e) => e.guild_ids.includes(guildId));

/** The folder a server is in, or undefined for a server on its own. */
export const folderOf = (rail: GuildFolder[], guildId: string): GuildFolder | undefined => rail.find((e) => isFolder(e) && e.guild_ids.includes(guildId));

/** Moves a server one place up (-1) or down (1) inside its folder, or among the top-level entries when it is on its own. Returns the same rail at an edge. */
export function stepGuild(rail: GuildFolder[], guildId: string, direction: -1 | 1): GuildFolder[] {
  const folder = folderOf(rail, guildId);
  if (folder) {
    const at = folder.guild_ids.indexOf(guildId);
    const to = at + direction;
    return to < 0 || to >= folder.guild_ids.length ? rail : moveIntoFolder(rail, guildId, folder.id!, to);
  }
  const at = topIndex(rail, guildId);
  const to = at + direction;
  return at < 0 || to < 0 || to >= rail.length ? rail : moveGuildToIndex(rail, guildId, to);
}

/** Moves a whole folder one place up or down the rail. */
export function stepFolder(rail: GuildFolder[], folderId: number, direction: -1 | 1): GuildFolder[] {
  const at = rail.findIndex((e) => e.id === folderId);
  const to = at + direction;
  return at < 0 || to < 0 || to >= rail.length ? rail : moveFolder(rail, folderId, to);
}

/** Puts a server into a folder, at its end. */
export const addToFolder = (rail: GuildFolder[], guildId: string, folderId: number): GuildFolder[] => collapseSingletons(moveIntoFolder(rail, guildId, folderId, Number.MAX_SAFE_INTEGER));

/** Takes a server out of its folder and puts it on its own right after that folder. */
export function removeFromFolder(rail: GuildFolder[], guildId: string): GuildFolder[] {
  const folder = folderOf(rail, guildId);
  if (!folder) return rail;
  const after = rail.indexOf(folder) + 1;
  return collapseSingletons(moveGuildToIndex(rail, guildId, after));
}

/** A new folder holding the server and another server that is on its own (the other comes first). */
export const createFolder = (rail: GuildFolder[], guildId: string, withGuildId: string): GuildFolder[] => dropOnto(rail, guildId, withGuildId);

/** Servers that are on their own, so a folder can be started with one of them. */
export const loneServers = (rail: GuildFolder[], exceptId: string): string[] => rail.filter((e) => !isFolder(e) && e.guild_ids[0] !== exceptId).map((e) => e.guild_ids[0]!);

export { ungroup };
