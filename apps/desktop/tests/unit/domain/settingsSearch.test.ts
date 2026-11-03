import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { rowSlug } from '@renderer/domain/rowSlug';
import { searchSettings, USER_SETTINGS_INDEX } from '@renderer/interface/features/settings/searchIndex';
import { USER_TABS } from '@renderer/interface/features/settings/userTabs';

describe('rowSlug', () => {
  it('builds a stable DOM id from a title', () => {
    expect(rowSlug('Send with Ctrl+Enter')).toBe('send-with-ctrl-enter');
    expect(rowSlug('Allow playback and use of /tts')).toBe('allow-playback-and-use-of-tts');
  });
});

describe('settings search', () => {
  it('returns nothing for an empty query', () => {
    expect(searchSettings('')).toEqual([]);
    expect(searchSettings('   ')).toEqual([]);
  });

  it('finds a row and points at its DOM id', () => {
    const [hit] = searchSettings('ctrl enter');
    expect(hit).toMatchObject({ tab: 'chat', label: 'Send with Ctrl+Enter', rowId: 'send-with-ctrl-enter' });
  });

  it('matches by keyword, not only by title', () => {
    expect(searchSettings('logout')[0]).toMatchObject({ tab: 'account', label: 'Log out' });
    expect(searchSettings('copy id').some((h) => h.tab === 'advanced' && h.rowId === 'developer-mode')).toBe(true);
  });

  it('finds a tab itself with no row id, ranked first for its own name', () => {
    expect(searchSettings('advanced')[0]).toMatchObject({ tab: 'advanced', rowId: null });
    expect(searchSettings('chat')[0]).toMatchObject({ tab: 'chat', rowId: null });
  });

  it('requires every word to match', () => {
    expect(searchSettings('developer zzzz')).toEqual([]);
  });

  it('keeps same-named rows in different tabs apart', () => {
    const hits = searchSettings('sync with computer').filter((h) => h.rowId === 'sync-with-computer');
    expect(hits.map((h) => h.tab).sort()).toEqual(['accessibility', 'appearance']);
  });

  it('caps the number of hits', () => {
    expect(searchSettings('a', USER_SETTINGS_INDEX, 5).length).toBeLessThanOrEqual(5);
  });

  it('indexes only tabs that exist, with unique ids inside a tab', () => {
    const tabs = new Set(USER_TABS.map((t) => t.id));
    const seen = new Set<string>();
    for (const e of USER_SETTINGS_INDEX) {
      expect(tabs.has(e.tab)).toBe(true);
      const key = `${e.tab}:${rowSlug(e.label)}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });
});

describe('settings index matches the tabs', () => {
  const dir = join(__dirname, '../../../src/renderer/interface/features/settings/user');
  const source = readdirSync(dir).filter((f) => f.endsWith('.tsx')).map((f) => readFileSync(join(dir, f), 'utf8')).join(String.fromCharCode(10));

  it('every indexed row is a SettingRow with that title', () => {
    for (const e of USER_SETTINGS_INDEX) expect(source, `${e.tab}: ${e.label}`).toContain(`title="${e.label}"`);
  });
});
