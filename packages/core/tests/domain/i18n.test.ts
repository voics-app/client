import { describe, expect, it } from 'vitest';
import { createI18n, createMessageFormatter, resolveLocale } from '@discordy/core/domain/i18n';
import { IntlMessageFormat } from 'intl-messageformat';
import { en } from '@discordy/core/domain/locales/en';
import { nl } from '@discordy/core/domain/locales/nl';

function argumentsOf(nodes: ReturnType<IntlMessageFormat['getAst']>): string[] {
  const found = new Set<string>();
  for (const node of nodes) {
    if ('value' in node && node.type !== 0 && node.type !== 8) found.add(node.value);
    if ('options' in node) for (const option of Object.values(node.options)) for (const name of argumentsOf(option.value)) found.add(name);
    if ('children' in node) for (const name of argumentsOf(node.children)) found.add(name);
  }
  return [...found].sort();
}

describe('locale resolution and ICU messages', () => {
  it('uses supported system languages only when the account has no preference', () => {
    expect(resolveLocale(undefined, ['fr-FR', 'nl-BE', 'en-US'])).toBe('nl-BE');
    expect(resolveLocale('en-GB', ['nl-NL'])).toBe('en-GB');
    expect(resolveLocale('nl', ['en-US'])).toBe('nl');
    expect(resolveLocale('bad_@tag', ['nl-NL'])).toBe('en-US');
    expect(resolveLocale(undefined, ['ar', 'ja'])).toBe('en-US');
  });

  it('formats Dutch plurals, numbers and interpolation without translating user content', () => {
    const intl = createI18n('nl');
    expect(intl.t('chat.messageCount', { count: 1 })).toBe('1 bericht');
    expect(intl.t('chat.messageCount', { count: 1234 })).toBe('1.234 berichten');
    expect(intl.t('chat.messageCount', { count: 0 })).toBe('0 berichten');
    expect(intl.t('chat.messageTo', { name: 'Hello <@123> مرحبا' })).toBe('Bericht aan Hello <@123> مرحبا');
    expect(intl.number(1234.5)).toBe('1.234,5');
    expect(intl.relative(-2, 'day')).toBe('eergisteren');
    expect(intl.date(new Date('2026-11-18T00:00:00Z'), { dateStyle: 'long', timeZone: 'UTC' })).toBe('18 november 2026');
  });

  it('falls back to English for missing or invalid translations', () => {
    const format = createMessageFormatter('nl', { broken: '{count, plural,' }, { missing: 'Hello {name}', broken: '{count, plural, one {# item} other {# items}}' });
    expect(format('missing', { name: 'Ada' })).toBe('Hello Ada');
    expect(format('broken', { count: 2 })).toBe('2 items');
  });

  it('compiles every shipped translation and retains all ICU arguments', () => {
    expect(Object.keys(nl).sort()).toEqual(Object.keys(en).sort());
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      const english = new IntlMessageFormat(en[key], 'en-US', undefined, { ignoreTag: true });
      const dutch = new IntlMessageFormat(nl[key], 'nl', undefined, { ignoreTag: true });
      expect(argumentsOf(dutch.getAst()), key).toEqual(argumentsOf(english.getAst()));
    }
  });

  it('retains regional date conventions and uses the chosen locale for relative time', () => {
    const instant = new Date('2026-11-18T12:00:00Z');
    expect(createI18n('en-US').date(instant, { dateStyle: 'short', timeZone: 'UTC' })).toBe('11/18/26');
    expect(createI18n('en-GB').date(instant, { dateStyle: 'short', timeZone: 'UTC' })).toBe('18/11/2026');
    expect(createI18n('nl').relative(-2, 'minute')).toBe('2 minuten geleden');
  });
});
