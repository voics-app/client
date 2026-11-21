import type { ReactNode } from 'react';
import type { MenuItemModel, MenuModel } from '@discordy/core/domain/menuModel';
import type { MenuEntry } from './Menu';
import { getI18n } from '../i18n';
import type { I18n } from '@discordy/core/domain/i18n';

/** Renders a framework-free menu model into Menu entries; `run` receives the chosen item. */
export function toMenuEntries(model: MenuModel[], run: (item: MenuItemModel) => void, icons: Record<string, ReactNode> = {}, intl: I18n = getI18n()): MenuEntry[] {
  return model.map((e): MenuEntry => {
    switch (e.kind) {
      case 'separator':
        return { kind: 'separator' };
      case 'label':
        // Group headings are application names, not product copy.
        return { kind: 'label', label: e.label };
      case 'submenu':
        return { kind: 'submenu', label: intl.catalogText(e.label), icon: icons[e.id], entries: toMenuEntries(e.items, run, icons, intl) };
      case 'item':
        // Emoji and installed-command names are authored content, even if named “Delete” or “Copy”.
        return { kind: 'item', label: e.id === 'react' || e.id === 'appCommand' ? e.label : intl.catalogText(e.label), icon: icons[e.id], danger: e.danger, disabled: e.disabled, title: e.hint ? intl.catalogText(e.hint) : undefined, checked: e.checked, onSelect: () => run(e) };
    }
  });
}
