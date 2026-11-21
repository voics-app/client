import { USER_PAGES, USER_SETTING_ROWS, isUserPage, searchUserSettings } from '../../src/settings/userPages';

describe('user settings pages', () => {
  it('lists the pages in desktop order and groups, without the desktop-only ones', () => {
    expect(USER_PAGES.map((p) => [p.group, p.label])).toEqual([
      ['User settings', 'My account'],
      ['User settings', 'Connections'],
      ['User settings', 'Profile'],
      ['User settings', 'Privacy and delivery'],
      ['User settings', 'Devices and sessions'],
      ['App settings', 'Appearance'],
      ['App settings', 'Accessibility'],
      ['App settings', 'Notifications'],
      ['App settings', 'Chat'],
    ]);
  });

  it('knows which ids are pages', () => {
    expect(isUserPage('chat')).toBe(true);
    expect(isUserPage('keybinds')).toBe(false);
  });

  it('gives every row to a page that exists', () => {
    for (const row of USER_SETTING_ROWS) expect(isUserPage(row.page)).toBe(true);
  });
});

describe('searching the settings', () => {
  it('finds nothing for an empty query', () => {
    expect(searchUserSettings('  ')).toEqual([]);
  });

  it('finds a row by its title and points at its slug', () => {
    expect(searchUserSettings('emoticons')[0]).toEqual({ page: 'chat', pageLabel: 'Chat', label: 'Convert emoticons', rowId: 'convert-emoticons' });
  });

  it('finds a row by keyword', () => {
    expect(searchUserSettings('2fa').some((h) => h.page === 'account' && h.label === 'Two-factor authentication')).toBe(true);
    expect(searchUserSettings('sign out').some((h) => h.page === 'account' && h.label === 'Log out')).toBe(true);
    expect(searchUserSettings('oled').some((h) => h.page === 'appearance' && h.label === 'Theme')).toBe(true);
  });

  it('finds a page itself, first for its own name', () => {
    expect(searchUserSettings('accessibility')[0]).toMatchObject({ page: 'accessibility', rowId: null });
  });

  it('finds blocked users under Privacy and the banner under Profile', () => {
    expect(searchUserSettings('blocked')[0]).toMatchObject({ page: 'privacy', label: 'Blocked users' });
    expect(searchUserSettings('banner')[0]).toMatchObject({ page: 'profile', label: 'Banner' });
  });
});
