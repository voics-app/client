import { useSessionStore } from '@renderer/application/stores/sessionStore';
import { attempt } from '../../app/actions';
import { publishPresence } from '../../app/presenceActions';
import { getRuntime } from '../../app/runtime';

export async function setStatusText(text: string | null, expiresAt: string | null = null): Promise<void> {
  const custom_status = text ? { text, expires_at: expiresAt } : null;
  useSessionStore.getState().setSettings({ custom_status });
  publishPresence();
  await attempt(() => getRuntime().api.updateSettings({ custom_status }), 'Could not update status');
}
