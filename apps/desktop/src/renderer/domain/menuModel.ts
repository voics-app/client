/** Framework-free context-menu description, built by pure functions and rendered by the Menu adapter. */
export interface MenuItemModel {
  kind: 'item';
  id: string;
  label: string;
  /** Opaque argument handed back to the handler (emoji, duration id, ...). */
  arg?: string;
  danger?: boolean;
  disabled?: boolean;
  checked?: boolean;
}

export type MenuModel =
  | MenuItemModel
  | { kind: 'separator' }
  | { kind: 'label'; label: string }
  | { kind: 'submenu'; id: string; label: string; items: MenuModel[] };

export const item = (id: string, label: string, extra: Partial<Omit<MenuItemModel, 'kind' | 'id' | 'label'>> = {}): MenuItemModel => ({ kind: 'item', id, label, ...extra });
export const sep = (): MenuModel => ({ kind: 'separator' });

/** Drops leading, trailing and doubled separators and empty submenus. */
export function tidy(entries: MenuModel[]): MenuModel[] {
  const out: MenuModel[] = [];
  for (const e of entries) {
    if (e.kind === 'submenu' && e.items.length === 0) continue;
    if (e.kind === 'separator' && (out.length === 0 || out[out.length - 1]!.kind === 'separator')) continue;
    out.push(e);
  }
  while (out.length > 0 && out[out.length - 1]!.kind === 'separator') out.pop();
  return out;
}

/** Ids of every selectable entry, depth first. Handy for assertions. */
export function idsOf(entries: MenuModel[]): string[] {
  return entries.flatMap((e) => (e.kind === 'item' ? [e.id] : e.kind === 'submenu' ? [e.id, ...idsOf(e.items)] : []));
}
