import type { LanguageChoice } from '../domain/i18n';
import type { ApiPort } from './ports/api';
import { useSessionStore } from './stores/sessionStore';

/** Change only this account's language; failed writes leave the confirmed locale intact. */
export async function saveLanguage(api: Pick<ApiPort, 'updateSettings'>, locale: LanguageChoice): Promise<void> {
  const userId = useSessionStore.getState().user?.id;
  if (!userId) throw new Error('Sign in before changing the account language.');
  const saved = await api.updateSettings({ locale });
  if (useSessionStore.getState().user?.id === userId) useSessionStore.getState().setSettings({ locale: saved.locale ?? locale });
}
