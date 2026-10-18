import { useSessionStore } from '@renderer/application/stores/sessionStore';
import { attempt } from '../../app/actions';
import { getRuntime } from '../../app/runtime';

export async function setStatusText(text: string | null): Promise<void> {
  const custom_status = text ? { text } : null;
  useSessionStore.getState().setSettings({ custom_status });
  await attempt(() => getRuntime().api.updateSettings({ custom_status }), 'Could not update status');
}
