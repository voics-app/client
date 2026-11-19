import { useEffect, useRef, type ReactNode } from 'react';
import { closeSettings, useUnsavedStore } from '@discordy/core/application/stores/unsavedStore';
import { useDialogFocus } from '../../shared/hooks/useDialogFocus';
import { SettingsCloseButton } from './SettingsCloseButton';

export function Layout({ title, nav, children, footer }: { title: string; nav: ReactNode; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useDialogFocus(ref);
  useEffect(() => {
    // Dialogs and menus opened on top of settings stop Escape in the capture phase, so only a bare Escape arrives here.
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeSettings(true);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div ref={ref} tabIndex={-1} className="settings" role="dialog" aria-modal="true" aria-label={title}>
      <nav className="settings-nav">{nav}{footer}</nav>
      <div className="settings-content">
        <div className="settings-inner">{children}</div>
        <SettingsCloseButton onClose={() => closeSettings()} />
      </div>
    </div>
  );
}

export function NavGroup({ title, children }: { title: string; children: ReactNode }) {
  return <div className="settings-group"><h3>{title}</h3>{children}</div>;
}

export function NavItem({ active, onClick, children, danger }: { active: boolean; onClick: () => void; children: ReactNode; danger?: boolean }) {
  return <button type="button" className={`settings-item${active ? ' is-active' : ''}${danger ? ' is-danger' : ''}`} onClick={onClick} aria-current={active || undefined}>{children}</button>;
}

/** Switches tab unless the current page holds unsaved edits, in which case the bar shakes instead. */
export const guarded = (go: () => void) => () => { if (useUnsavedStore.getState().requestLeave()) go(); };

