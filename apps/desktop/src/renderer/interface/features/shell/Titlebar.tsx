import { Tray, MagnifyingGlass, WifiSlash } from '@phosphor-icons/react';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import { BRAND } from '@shared/brand';

const isMac = navigator.userAgent.includes('Mac');

/** Draggable title bar with the palette trigger centred as a glass pill. */
export function Titlebar() {
  const gateway = useSessionStore((s) => s.gateway);
  const open = useUiStore((s) => s.openPalette);
  const openDialog = useUiStore((s) => s.openDialog);
  const offline = gateway !== 'ready' && gateway !== 'idle';
  return (
    <header className={`titlebar${isMac ? ' is-mac' : ''}`}>
      <div className="titlebar-brand">
        <span className="brand-mark" aria-hidden="true" />
        <span>{BRAND.displayName}</span>
      </div>
      <button type="button" className="palette-pill" onClick={() => open(true)} aria-label="Open command palette">
        <MagnifyingGlass size={14} />
        <span>Search or jump to</span>
        <kbd className="kbd">Ctrl K</kbd>
      </button>
      <div className="titlebar-end">
        <button type="button" className="titlebar-icon" aria-label="Mentions inbox (Ctrl+I)" title="Mentions (Ctrl+I)" onClick={() => openDialog({ kind: 'inbox' })}>
          <Tray size={16} />
        </button>
        {offline && (
          <span className="net-pill" role="status">
            <WifiSlash size={14} /> {gateway === 'closed' ? 'Disconnected' : 'Reconnecting'}
          </span>
        )}
      </div>
    </header>
  );
}
