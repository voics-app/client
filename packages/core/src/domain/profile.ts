import { RelationshipType, type Relationship } from '../contracts/rest';

/** Longest "About me" text a profile may carry. */
export const BIO_MAX_LENGTH = 300;

/** When two people became friends, or null when they are not friends or the time is unknown. */
export function friendsSince(relationship: Relationship | undefined): Date | null {
  if (relationship?.type !== RelationshipType.FRIEND || !relationship.since) return null;
  const date = new Date(relationship.since);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Present a badge identifier readably until a product catalog supplies display names. */
export function badgeLabel(id: string): string {
  const words = id.replace(/[_-]+/g, ' ').trim();
  return words ? words[0]!.toUpperCase() + words.slice(1) : id;
}
