import { createI18n, resolveLocale } from '@discordy/core/domain/i18n';

// The renderer reports the current account preference; no second persisted preference lives in main.
let current = createI18n('en-US');

export function setNativeLocale(value: unknown): string {
  current = createI18n(resolveLocale(typeof value === 'string' && value.length <= 64 ? value : undefined));
  return current.locale;
}

export const nativeI18n = () => current;
