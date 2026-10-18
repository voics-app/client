import { MagnifyingGlass, WifiSlash } from '@phosphor-icons/react';
import { useSessionStore } from '@renderer/application/stores/sessionStore';
import { useUiStore } from '@renderer/application/stores/uiStore';

const isMac = navigator.userAgent.includes('Mac');

/** Draggable title bar with the palette trigger centred as a glass pill. */
export function Titlebar() {
  const gateway = useSessionStore((s) => s.gateway);
  const open = useUiStore((s) => s.openPalette);
  const offline = gateway !== 'ready' && gateway !== 'idle';
  return (
    <header className={`titlebar${isMac ? ' is-mac' : ''}`}>
      <div className="titlebar-brand">
        <span className="brand-mark" aria-hidden="true" />
        <span>Discordy</span>
      </div>
      <button type="button" className="palette-pill" onClick={() => open(true)} aria-label="Open command palette">
        <MagnifyingGlass size={14} />
        <span>Search or jump to</span>
        <kbd className="kbd">Ctrl K</kbd>
      </button>
      <div className="titlebar-end">
        {offline && (
          <span className="net-pill" role="status">
            <WifiSlash size={14} /> {gateway === 'closed' ? 'Disconnected' : 'Reconnecting'}
          </span>
        )}
      </div>
    </header>
  );
}
