import { ChannelType, type Channel } from '../contracts/rest';

export interface BulkLeaveResult {
  left: string[];
  failed: string[];
}

const groups = (n: number) => `${n} group DM${n === 1 ? '' : 's'}`;

/** Ids of the conversations that may be ticked in selection mode: group DMs only. */
export function selectableGroupIds(dms: Channel[]): string[] {
  return dms.filter((c) => c.type === ChannelType.GROUP_DM).map((c) => c.id);
}

export function toggleSelected(selected: string[], id: string): string[] {
  return selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id];
}

/** Drops ticked ids that left the list meanwhile (closed, left elsewhere); returns the same array when unchanged. */
export function pruneSelection(selected: string[], selectable: string[]): string[] {
  const kept = selected.filter((id) => selectable.includes(id));
  return kept.length === selected.length ? selected : kept;
}

export function bulkLeaveConfirmation(count: number): { title: string; body: string; confirmLabel: string } {
  return {
    title: `Leave ${groups(count)}?`,
    body: 'You will stop receiving messages from these groups. You can only rejoin if a member adds you back.',
    confirmLabel: count === 1 ? 'Leave group DM' : `Leave ${groups(count)}`,
  };
}

/** Runs the leaves one after another (rate limits); a failure never stops the rest. */
export async function leaveSequentially(ids: string[], leave: (id: string) => Promise<boolean>): Promise<BulkLeaveResult> {
  const result: BulkLeaveResult = { left: [], failed: [] };
  for (const id of ids) {
    const ok = await leave(id).catch(() => false);
    (ok ? result.left : result.failed).push(id);
  }
  return result;
}

export function bulkLeaveOutcomeMessage(result: BulkLeaveResult, names: Record<string, string>): { tone: 'success' | 'danger'; title: string; body: string | undefined } {
  if (result.failed.length === 0) return { tone: 'success', title: `Left ${groups(result.left.length)}`, body: undefined };
  const list = result.failed.map((id) => names[id] ?? id).join(', ');
  const title = result.left.length > 0 ? `Left ${groups(result.left.length)}, ${result.failed.length} failed` : `Could not leave ${groups(result.failed.length)}`;
  return { tone: 'danger', title, body: `Could not leave: ${list}` };
}
