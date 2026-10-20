/**
 * Native fallback context menu for text fields, selections, links and images. The renderer's own menus call
 * preventDefault on `contextmenu`, in which case Chromium never raises `context-menu` here, so this only
 * shows where the app has no menu of its own.
 */
import { Menu, clipboard, shell, type MenuItemConstructorOptions, type WebContents } from 'electron';

export interface TextMenuParams {
  isEditable: boolean;
  selectionText: string;
  misspelledWord: string;
  dictionarySuggestions: readonly string[];
  linkURL: string;
  mediaType: string;
  srcURL: string;
  editFlags: { canCut: boolean; canCopy: boolean; canPaste: boolean; canSelectAll: boolean };
}

export type TextMenuAction =
  | { type: 'replaceMisspelling'; word: string }
  | { type: 'addToDictionary'; word: string }
  | { type: 'openLink'; url: string }
  | { type: 'copyLink'; url: string }
  | { type: 'copyImage' }
  | { type: 'saveImage'; url: string };

export type TextMenuItem =
  | { type: 'separator' }
  | { type: 'role'; role: 'cut' | 'copy' | 'paste' | 'selectAll'; label: string; enabled: boolean }
  | { type: 'item'; label: string; enabled: boolean; action: TextMenuAction };

const MAX_SUGGESTIONS = 5;
const isHttp = (url: string) => /^https?:\/\//i.test(url);

/** Pure template builder: no Electron state, unit tested. */
export function buildTextMenu(p: TextMenuParams): TextMenuItem[] {
  const groups: TextMenuItem[][] = [];

  if (p.isEditable && p.misspelledWord) {
    const spelling: TextMenuItem[] = p.dictionarySuggestions
      .slice(0, MAX_SUGGESTIONS)
      .map((word) => ({ type: 'item', label: word, enabled: true, action: { type: 'replaceMisspelling', word } }) satisfies TextMenuItem);
    if (spelling.length === 0) spelling.push({ type: 'item', label: 'No suggestions', enabled: false, action: { type: 'addToDictionary', word: '' } });
    spelling.push({ type: 'item', label: 'Add to dictionary', enabled: true, action: { type: 'addToDictionary', word: p.misspelledWord } });
    groups.push(spelling);
  }

  if (p.linkURL) {
    const links: TextMenuItem[] = [];
    if (isHttp(p.linkURL)) links.push({ type: 'item', label: 'Open link', enabled: true, action: { type: 'openLink', url: p.linkURL } });
    links.push({ type: 'item', label: 'Copy link address', enabled: true, action: { type: 'copyLink', url: p.linkURL } });
    groups.push(links);
  }

  if (p.mediaType === 'image' && p.srcURL) {
    const images: TextMenuItem[] = [{ type: 'item', label: 'Copy image', enabled: true, action: { type: 'copyImage' } }];
    if (isHttp(p.srcURL)) images.push({ type: 'item', label: 'Save image as...', enabled: true, action: { type: 'saveImage', url: p.srcURL } });
    groups.push(images);
  }

  if (p.isEditable) {
    groups.push([
      { type: 'role', role: 'cut', label: 'Cut', enabled: p.editFlags.canCut },
      { type: 'role', role: 'copy', label: 'Copy', enabled: p.editFlags.canCopy },
      { type: 'role', role: 'paste', label: 'Paste', enabled: p.editFlags.canPaste },
      { type: 'role', role: 'selectAll', label: 'Select all', enabled: p.editFlags.canSelectAll },
    ]);
  } else if (p.selectionText.trim()) {
    groups.push([{ type: 'role', role: 'copy', label: 'Copy', enabled: p.editFlags.canCopy }]);
  }

  return groups.flatMap((g, i) => (i === 0 ? g : [{ type: 'separator' } satisfies TextMenuItem, ...g]));
}

function toElectron(items: TextMenuItem[], contents: WebContents, x: number, y: number): MenuItemConstructorOptions[] {
  return items.map((item): MenuItemConstructorOptions => {
    if (item.type === 'separator') return { type: 'separator' };
    if (item.type === 'role') return { role: item.role, label: item.label, enabled: item.enabled };
    return { label: item.label, enabled: item.enabled, click: () => runAction(item.action, contents, x, y) };
  });
}

function runAction(action: TextMenuAction, contents: WebContents, x: number, y: number): void {
  switch (action.type) {
    case 'replaceMisspelling':
      contents.replaceMisspelling(action.word);
      break;
    case 'addToDictionary':
      if (action.word) contents.session.addWordToSpellCheckerDictionary(action.word);
      break;
    case 'openLink':
      if (isHttp(action.url)) void shell.openExternal(action.url);
      break;
    case 'copyLink':
      clipboard.writeText(action.url);
      break;
    case 'copyImage':
      contents.copyImageAt(x, y);
      break;
    case 'saveImage':
      contents.downloadURL(action.url);
      break;
  }
}

export function installTextContextMenu(contents: WebContents): void {
  contents.on('context-menu', (_event, params) => {
    const items = buildTextMenu(params);
    if (items.length === 0) return;
    Menu.buildFromTemplate(toElectron(items, contents, params.x, params.y)).popup();
  });
}

/** Spellcheck in the OS language (Linux has no default), restricted to dictionaries Electron can load. */
export function configureSpellcheck(contents: WebContents, locale: string): void {
  const { session } = contents;
  if (!session.isSpellCheckerEnabled()) session.setSpellCheckerEnabled(true);
  const available = session.availableSpellCheckerLanguages;
  const wanted = [locale, locale.split('-')[0] ?? '', 'en-US'].filter((l, i, all) => l && available.includes(l) && all.indexOf(l) === i);
  if (wanted.length > 0) session.setSpellCheckerLanguages(wanted.slice(0, 2));
}
