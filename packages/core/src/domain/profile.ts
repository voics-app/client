import { RelationshipType, type Relationship } from '../contracts/rest';

/** Longest "About me" text a profile may carry. */
export const BIO_MAX_LENGTH = 300;

/** When two people became friends, or null when they are not friends or the time is unknown. */
export function friendsSince(relationship: Relationship | undefined): Date | null {
  if (relationship?.type !== RelationshipType.FRIEND || !relationship.since) return null;
  const date = new Date(relationship.since);
  return Number.isNaN(date.getTime()) ? null : date;
}
