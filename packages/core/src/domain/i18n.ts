import { IntlMessageFormat } from 'intl-messageformat';
import { en, type MessageId } from './locales/en';
import { nl } from './locales/nl';

export type LanguageChoice = 'en-US' | 'nl';
export type MessageValues = Record<string, string | number | boolean | Date>;
export const LANGUAGES = [{ value: 'en-US', name: 'English' }, { value: 'nl', name: 'Nederlands' }] as const;
const messageBySource = new Map<string, MessageId>(Object.entries(en).map(([id, source]) => [source, id as MessageId]));

function supportedLocale(value: string): string | null {
  try {
    const locale = Intl.getCanonicalLocales(value)[0];
    return locale && /^(en|nl)(-|$)/.test(locale) ? locale : null;
  } catch {
    return null;
  }
}

/** Explicit account choices win; unsupported choices use English, never another account's locale. */
export function resolveLocale(preference?: string, systemLanguages: readonly string[] = []): string {
  if (preference) return supportedLocale(preference) ?? 'en-US';
  for (const language of systemLanguages) {
    const supported = supportedLocale(language);
    if (supported) return supported;
  }
  return 'en-US';
}

/** Compiles ICU messages once and degrades to the canonical catalog on missing/broken translations. */
export function createMessageFormatter<K extends string>(locale: string, messages: Partial<Record<K, string>>, fallback: Record<K, string>) {
  const cache = new Map<string, IntlMessageFormat>();
  const format = (source: string, language: string, values: MessageValues) => {
    const key = `${language}:${source}`;
    let formatter = cache.get(key);
    if (!formatter) {
      formatter = new IntlMessageFormat(source, language, undefined, { ignoreTag: true });
      cache.set(key, formatter);
    }
    return String(formatter.format(values));
  };
  return (id: K, values: MessageValues = {}): string => {
    try {
      return format(messages[id] ?? fallback[id], locale, values);
    } catch {
      // A catalog defect must not take the chat down. Catalog parity/argument tests catch it in CI.
      try { return format(fallback[id], 'en-US', values); } catch { return en['common.unavailable']; }
    }
  };
}

export function createI18n(preference?: string) {
  const locale = resolveLocale(preference);
  const language: LanguageChoice = locale.startsWith('nl') ? 'nl' : 'en-US';
  const t = createMessageFormatter<MessageId>(locale, language === 'nl' ? nl : en, en);
  return {
    locale,
    language,
    direction: 'ltr' as const,
    t,
    /** For trusted product-copy constants (settings index/domain choices), never user-authored content. */
    catalogText: (source: string): string => {
      const id = messageBySource.get(source);
      return id ? t(id) : source;
    },
    number: (value: number, options?: Intl.NumberFormatOptions) => new Intl.NumberFormat(locale, options).format(value),
    date: (value: number | Date, options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }) => new Intl.DateTimeFormat(locale, options).format(value),
    relative: (value: number, unit: Intl.RelativeTimeFormatUnit) => new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(value, unit),
    list: (values: string[]) => new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(values),
  };
}

export type I18n = ReturnType<typeof createI18n>;
export type { MessageId };
