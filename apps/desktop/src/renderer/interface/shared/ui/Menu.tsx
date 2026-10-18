import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { snappy } from './motion';

export type MenuEntry =
  | { kind: 'item'; label: string; icon?: ReactNode; shortcut?: string; danger?: boolean; disabled?: boolean; checked?: boolean; onSelect: () => void }
  | { kind: 'separator' }
  | { kind: 'label'; label: string };

interface Props {
  open: boolean;
  x: number;
  y: number;
  entries: MenuEntry[];
  onClose: () => void;
  minWidth?: number;
}

/** Glass context/dropdown menu with arrow-key navigation, clamped to the viewport. */
export function Menu({ open, x, y, entries, onClose, minWidth = 200 }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const el = ref.current;
    el?.querySelector<HTMLElement>('[role=menuitem]:not([disabled])')?.focus();
    const onDown = (e: globalThis.MouseEvent) => {
      if (!el?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const items = [...(el?.querySelectorAll<HTMLElement>('[role=menuitem]:not([disabled])') ?? [])];
        if (items.length === 0) return;
        const i = items.indexOf(document.activeElement as HTMLElement);
        const next = e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
        items[next]?.focus();
      }
    };
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('blur', onClose);
    return () => {
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('blur', onClose);
    };
  }, [open, onClose]);

  const left = Math.max(8, Math.min(x, window.innerWidth - minWidth - 12));
  const maxTop = window.innerHeight - Math.min(entries.length * 34 + 16, 480) - 12;
  const top = Math.max(8, Math.min(y, maxTop));

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          ref={ref}
          role="menu"
          className="menu glass"
          style={{ left, top, minWidth }}
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.97 }}
          transition={snappy}
        >
          {entries.map((entry, i) => {
            if (entry.kind === 'separator') return <div key={i} className="menu-sep" role="separator" />;
            if (entry.kind === 'label')
              return (
                <div key={i} className="menu-label">
                  {entry.label}
                </div>
              );
            return (
              <button
                key={i}
                type="button"
                role="menuitem"
                disabled={entry.disabled}
                className={`menu-item${entry.danger ? ' is-danger' : ''}`}
                onClick={() => {
                  onClose();
                  entry.onSelect();
                }}
              >
                <span className="menu-icon">{entry.icon}</span>
                <span className="menu-text">{entry.label}</span>
                {entry.checked && (
                  <span className="menu-check" aria-hidden="true">
                    ●
                  </span>
                )}
                {entry.shortcut && <kbd className="kbd">{entry.shortcut}</kbd>}
              </button>
            );
          })}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export interface MenuAnchor {
  x: number;
  y: number;
}

/** Opens a menu at the pointer (context menu) or below a trigger element. */
export function useMenu() {
  const [anchor, setAnchor] = useState<MenuAnchor | null>(null);
  const openAt = useCallback((e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setAnchor({ x: e.clientX, y: e.clientY });
  }, []);
  const openBelow = useCallback((e: MouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setAnchor({ x: r.left, y: r.bottom + 6 });
  }, []);
  const close = useCallback(() => setAnchor(null), []);
  return { anchor, openAt, openBelow, close, open: anchor !== null };
}
