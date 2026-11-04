import { useSessionStore } from '@renderer/application/stores/sessionStore';
import { clampStatusText } from '@discordy/core/domain/selfPresence';
import { attempt } from '../../app/actions';
import { publishPresence } from '../../app/presenceActions';
import { getRuntime } from '../../app/runtime';

export interface StatusEmoji {
  name: string;
  id?: string | null;
}

/** Saves the custom status (text and/or emoji), publishes it to everyone and syncs it to the account. Null text and emoji clears it. */
export async function setStatusText(text: string | null, expiresAt: string | null = null, emoji: StatusEmoji | null = null): Promise<void> {
  const clean = text ? clampStatusText(text) : '';
  const custom_status = clean || emoji ? { text: clean || null, emoji_id: emoji?.id ?? null, emoji_name: emoji?.name ?? null, expires_at: expiresAt } : null;
  useSessionStore.getState().setSettings({ custom_status });
  publishPresence();
  await attempt(() => getRuntime().api.updateSettings({ custom_status }), 'Could not update status');
}
