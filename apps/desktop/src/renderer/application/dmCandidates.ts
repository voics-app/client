import { RelationshipType, type GuildMember, type Relationship, type User, type Channel } from '@shared/contracts/rest';

export interface DmCandidate {
  id: string;
  name: string;
  avatar: string | null;
}

interface DmCandidateSources {
  meId: string | null | undefined;
  members: Record<string, Record<string, GuildMember>>;
  channels: Record<string, Channel>;
  relationships: Record<string, Relationship>;
  displayName(user: Pick<User, 'username' | 'global_name'>, nick?: string | null): string;
}

/** People offered by the New DM picker: friends, then members of shared servers and DM recipients (excluding me and bots). First source wins per user, so friend data takes precedence. */
export function dmCandidates({ meId, members, channels, relationships, displayName }: DmCandidateSources): DmCandidate[] {
  const people = new Map<string, DmCandidate>();
  for (const rel of Object.values(relationships)) {
    if (rel.type !== RelationshipType.FRIEND || rel.user.id === meId || rel.user.bot) continue;
    people.set(rel.user.id, { id: rel.user.id, name: displayName(rel.user, rel.nickname), avatar: rel.user.avatar ?? null });
  }
  for (const guildMembers of Object.values(members)) {
    for (const m of Object.values(guildMembers)) {
      if (m.user.id === meId || m.user.bot) continue;
      if (!people.has(m.user.id)) people.set(m.user.id, { id: m.user.id, name: displayName(m.user, m.nick), avatar: m.user.avatar });
    }
  }
  for (const c of Object.values(channels)) {
    for (const u of c.recipients ?? []) {
      if (u.id === meId) continue;
      if (!people.has(u.id)) people.set(u.id, { id: u.id, name: displayName(u), avatar: u.avatar });
    }
  }
  return [...people.values()];
}
