import { createI18n } from './i18n';
import { ChannelType, type Channel } from '../contracts/rest';

export interface BulkLeaveResult {
  left: string[];
  failed: string[];
}


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

export function bulkLeaveConfirmation(count: number, locale?: string): { title: string; body: string; confirmLabel: string } {
  return {
    title: createI18n(locale).t('group.bulkLeave', { count }),
    body: createI18n(locale).t('group.bulkBody'),
    confirmLabel: createI18n(locale).t('group.bulkConfirm', { count }),
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

export function bulkLeaveOutcomeMessage(result: BulkLeaveResult, names: Record<string, string>, locale?: string): { tone: 'success' | 'danger'; title: string; body: string | undefined } {
  if (result.failed.length === 0) return { tone: 'success', title: createI18n(locale).t('group.left', { count: result.left.length }), body: undefined };
  const list = createI18n(locale).list(result.failed.map((id) => names[id] ?? id));
  const title = createI18n(locale).t(result.left.length > 0 ? 'group.partiallyLeft' : 'group.failedLeave', { count: result.left.length > 0 ? result.left.length : result.failed.length, failed: result.failed.length });
  return { tone: 'danger', title, body: createI18n(locale).t('group.failedNames', { names: list }) };
}
