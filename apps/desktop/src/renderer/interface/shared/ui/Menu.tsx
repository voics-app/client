import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { wrapIndex } from '@discordy/core/domain/rovingFocus';
import { snappy } from './motion';

export type MenuEntry =
  | { kind: 'item'; label: string; icon?: ReactNode; shortcut?: string; danger?: boolean; disabled?: boolean; title?: string; checked?: boolean; onSelect: () => void }
  | { kind: 'separator' }
  | { kind: 'label'; label: string }
  | { kind: 'submenu'; label: string; icon?: ReactNode; entries: MenuEntry[] }
  | { kind: 'content'; node: ReactNode };

function SubmenuItem({ entry, onClose }: { entry: Extract<MenuEntry, { kind: 'submenu' }>; onClose: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const flip = open && (ref.current?.getBoundingClientRect().right ?? 0) + 200 > window.innerWidth;
  return (
    <div
      ref={ref}
      className="menu-sub"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
          requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>('.menu-sub-panel [role=menuitem]:not([disabled])')?.focus());
        } else if (e.key === 'ArrowLeft' && open) {
          e.preventDefault();
          e.stopPropagation();
          setOpen(false);
          ref.current?.querySelector<HTMLElement>(':scope > [role=menuitem]')?.focus();
        }
      }}
    >
      <button type="button" role="menuitem" aria-haspopup="menu" aria-expanded={open} className="menu-item" onClick={() => setOpen((v) => !v)}>
        <span className="menu-icon">{entry.icon}</span>
        <span className="menu-text">{entry.label}</span>
        <span className="menu-caret" aria-hidden="true">›</span>
      </button>
      {open && (
        <div className={`menu glass menu-sub-panel${flip ? ' is-flipped' : ''}`} role="menu" aria-label={entry.label}>
          {entry.entries.map((sub, i) =>
            sub.kind === 'item' ? (
              <button
                key={i}
                type="button"
                role="menuitem"
                disabled={sub.disabled}
                className={`menu-item${sub.danger ? ' is-danger' : ''}`}
                onClick={() => {
                  onClose();
                  sub.onSelect();
                }}
              >
                <span className="menu-icon">{sub.icon}</span>
                <span className="menu-text">{sub.label}</span>
              </button>
            ) : sub.kind === 'separator' ? (
              <div key={i} className="menu-sep" role="separator" />
            ) : null,
          )}
        </div>
      )}
    </div>
  );
}

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
    // Escape (or any close) hands focus back to whatever opened the menu.
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    el?.querySelector<HTMLElement>('[role=menuitem]:not([disabled])')?.focus();
    const onDown = (e: globalThis.MouseEvent) => {
      if (!el?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      } else if (e.key === 'Tab') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Home' || e.key === 'End') {
        e.preventDefault();
        const items = [...(el?.querySelectorAll<HTMLElement>('[role=menuitem]:not([disabled])') ?? [])];
        if (items.length === 0) return;
        const i = items.indexOf(document.activeElement as HTMLElement);
        const next = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : wrapIndex(items.length, i, e.key === 'ArrowDown' ? 1 : -1);
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
      if (trigger?.isConnected && (document.activeElement === document.body || el?.contains(document.activeElement))) trigger.focus();
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
          className={`menu glass${entries.some((e) => e.kind === 'submenu') ? ' has-sub' : ''}`}
          style={{ left, top, minWidth }}
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.97 }}
          transition={snappy}
        >
          {entries.map((entry, i) => {
            if (entry.kind === 'separator') return <div key={i} className="menu-sep" role="separator" />;
            if (entry.kind === 'submenu') return <SubmenuItem key={i} entry={entry} onClose={onClose} />;
            if (entry.kind === 'content')
              return (
                <div key={i} className="menu-content">
                  {entry.node}
                </div>
              );
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
                title={entry.title}
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
