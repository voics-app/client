import { describe, expect, it, vi } from 'vitest';
import { buildTrayMenu } from '../../../src/main/desktop/trayModel';
import { AttentionPresenter } from '../../../src/main/attention/presenter';
vi.mock('electron', () => ({ Menu: {}, clipboard: {}, shell: {} }));
import { buildTextMenu, type TextMenuParams } from '../../../src/main/textMenu';

describe('native account language', () => {
  it('translates tray actions and formatted totals without changing command IDs', () => {
    const menu = buildTrayMenu({ brand: 'Voics', version: '1.2.3', activity: { mentions: 1200, unread: 2 }, voice: { muted: false, deafened: true }, locale: 'nl' });
    expect(menu).toContainEqual(expect.objectContaining({ id: 'unread', label: '1.200 vermeldingen en 2 ongelezen' }));
    expect(menu).toContainEqual(expect.objectContaining({ id: 'mute', label: 'Dempen', action: 'toggleMute', checked: true, enabled: false }));
    expect(menu).toContainEqual(expect.objectContaining({ id: 'updates', label: 'Controleren op updates', action: 'checkUpdates' }));
  });

  it('relabels existing Windows attention state when only the locale changes', () => {
    const port = { setOverlay: vi.fn(), setBadgeCount: vi.fn(), setTitle: vi.fn(), setTray: vi.fn() };
    const presenter = new AttentionPresenter(port, 'Voics', () => null, 'win32');
    presenter.apply({ mentions: 2, unread: 1 });
    presenter.setLocale('nl');
    expect(port.setOverlay).toHaveBeenLastCalledWith(expect.anything(), '2 vermeldingen en 1 ongelezen kanaal');
    expect(port.setTray).toHaveBeenLastCalledWith(null, 'Voics - 2 vermeldingen en 1 ongelezen kanaal');
    expect(port.setTitle).toHaveBeenLastCalledWith('(2) Voics');
  });

  it('translates native edit commands while leaving dictionary suggestions and original spellings untouched', () => {
    const params: TextMenuParams = { isEditable: true, selectionText: '', misspelledWord: 'origineel', dictionarySuggestions: ['Copy', 'مرحبا'], linkURL: '', mediaType: '', srcURL: '', editFlags: { canCut: true, canCopy: true, canPaste: true, canSelectAll: true } };
    const menu = buildTextMenu(params, 'nl');
    expect(menu).toContainEqual({ type: 'item', label: 'Copy', enabled: true, action: { type: 'replaceMisspelling', word: 'Copy' } });
    expect(menu).toContainEqual({ type: 'item', label: 'Toevoegen aan woordenboek', enabled: true, action: { type: 'addToDictionary', word: 'origineel' } });
    expect(menu).toContainEqual({ type: 'role', role: 'copy', label: 'Kopiëren', enabled: true });
  });
});
