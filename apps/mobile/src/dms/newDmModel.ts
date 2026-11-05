import { MAX_GROUP_DM_MEMBERS } from '@discordy/core/domain/dmModel';
import type { DmCandidate } from '@discordy/core/application/dmCandidates';

/** How many people besides you a group DM takes. */
export const MAX_RECIPIENTS = MAX_GROUP_DM_MEMBERS - 1;

/** Candidates whose name contains the query, alphabetical. */
export function filterCandidates(candidates: readonly DmCandidate[], query: string): DmCandidate[] {
  const needle = query.trim().toLowerCase();
  return candidates.filter((c) => c.name.toLowerCase().includes(needle)).sort((a, b) => a.name.localeCompare(b.name));
}

/** Adds or removes a person; a full group ignores further additions. */
export function toggleRecipient(selected: readonly string[], id: string, max = MAX_RECIPIENTS): string[] {
  if (selected.includes(id)) return selected.filter((s) => s !== id);
  return selected.length >= max ? [...selected] : [...selected, id];
}

/** What the confirm button says: a single person opens their DM, several make a group. */
export function confirmLabel(count: number): string | null {
  return count === 0 ? null : count === 1 ? 'Message' : 'Create group';
}
