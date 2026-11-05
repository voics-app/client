import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { buildCustomStatus, type StatusEmoji } from '@discordy/core/domain/selfPresence';
import { attempt } from '../../app/actions';
import { publishPresence } from '../../app/presenceActions';
import { getRuntime } from '../../app/runtime';

export type { StatusEmoji };

/** Saves the custom status (text and/or emoji), publishes it to everyone and syncs it to the account. Null text and emoji clears it. */
export async function setStatusText(text: string | null, expiresAt: string | null = null, emoji: StatusEmoji | null = null): Promise<void> {
  const custom_status = buildCustomStatus(text, expiresAt, emoji);
  useSessionStore.getState().setSettings({ custom_status });
  publishPresence();
  await attempt(() => getRuntime().api.updateSettings({ custom_status }), 'Could not update status');
}
