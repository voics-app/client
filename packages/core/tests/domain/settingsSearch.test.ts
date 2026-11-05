import { describe, expect, it } from 'vitest';
import { scoreSetting, searchSettingsIndex } from '../../src/domain/settingsSearch';

const pages = [
  { id: 'account', label: 'My account', keywords: 'password sign out' },
  { id: 'chat', label: 'Chat', keywords: 'messages emoji' },
] as const;
const rows = [
  { page: 'account', label: 'Log out', keywords: 'sign out logout' },
  { page: 'chat', label: 'Show reactions' },
  { page: 'chat', label: 'Convert emoticons', keywords: 'smiley' },
] as const;

describe('scoreSetting', () => {
  it('ranks a title prefix before a word prefix, a substring and a keyword', () => {
    const scores = [scoreSetting('log', 'Log out', ''), scoreSetting('out', 'Log out', ''), scoreSetting('ogo', 'Logout', ''), scoreSetting('exit', 'Log out', 'exit')];
    expect(scores).toEqual([0, 1, 2, 4]);
  });

  it('needs every word to match and nothing for an empty query', () => {
    expect(scoreSetting('log zzz', 'Log out', '')).toBeNull();
    expect(scoreSetting('  ', 'Log out', '')).toBeNull();
  });
});

describe('searchSettingsIndex', () => {
  it('finds rows by keyword and gives them the slug of their title', () => {
    expect(searchSettingsIndex('sign out', pages, rows)[0]).toEqual({ page: 'account', pageLabel: 'My account', label: 'Log out', rowId: 'log-out' });
  });

  it('ranks a page above a row with the same score and gives it no row id', () => {
    expect(searchSettingsIndex('chat', pages, rows)[0]).toEqual({ page: 'chat', pageLabel: 'Chat', label: 'Chat', rowId: null });
  });

  it('matches the page name for its rows and honours the limit', () => {
    expect(searchSettingsIndex('chat', pages, rows).map((h) => h.label)).toEqual(['Chat', 'Show reactions', 'Convert emoticons']);
    expect(searchSettingsIndex('chat', pages, rows, 1)).toHaveLength(1);
    expect(searchSettingsIndex('', pages, rows)).toEqual([]);
  });
});
