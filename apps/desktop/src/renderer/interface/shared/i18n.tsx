import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { createI18n, resolveLocale } from '@discordy/core/domain/i18n';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';

const I18nContext = createContext(createI18n('en-US'));
const systemSnapshot = () => navigator.languages.join(',');
const subscribeSystem = (changed: () => void) => {
  window.addEventListener('languagechange', changed);
  return () => window.removeEventListener('languagechange', changed);
};

/** One reactive locale boundary also covers portals, memoized messages and accessible labels. */
export function LocaleProvider({ children }: { children: ReactNode }) {
  const preference = useSessionStore((state) => state.settings.locale);
  const system = useSyncExternalStore(subscribeSystem, systemSnapshot, () => 'en-US');
  const locale = resolveLocale(preference, system.split(','));
  const intl = useMemo(() => createI18n(locale), [locale]);
  useEffect(() => {
    document.documentElement.lang = intl.locale;
    document.documentElement.dir = intl.direction;
  }, [intl]);
  return <I18nContext.Provider value={intl}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext);

/** Read the current account at action time for menus/commands outside React. Never caches a previous account. */
export const getI18n = () => createI18n(resolveLocale(useSessionStore.getState().settings.locale, navigator.languages));
