import type { ReactNode } from 'react';
import type { MenuItemModel, MenuModel } from '@discordy/core/domain/menuModel';
import type { MenuEntry } from './Menu';

/** Renders a framework-free menu model into Menu entries; `run` receives the chosen item. */
export function toMenuEntries(model: MenuModel[], run: (item: MenuItemModel) => void, icons: Record<string, ReactNode> = {}): MenuEntry[] {
  return model.map((e): MenuEntry => {
    switch (e.kind) {
      case 'separator':
        return { kind: 'separator' };
      case 'label':
        return { kind: 'label', label: e.label };
      case 'submenu':
        return { kind: 'submenu', label: e.label, icon: icons[e.id], entries: toMenuEntries(e.items, run, icons) };
      case 'item':
        return { kind: 'item', label: e.label, icon: icons[e.id], danger: e.danger, disabled: e.disabled, title: e.hint, checked: e.checked, onSelect: () => run(e) };
    }
  });
}
