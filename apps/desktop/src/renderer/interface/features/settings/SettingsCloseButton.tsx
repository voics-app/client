import { X } from '@phosphor-icons/react';

/** Discord's round X with an "ESC" caption at the top right of the settings content. */
export function SettingsCloseButton({ onClose }: { onClose: () => void }) {
  return (
    <div className="settings-close">
      <button type="button" className="settings-close-btn" aria-label="Close settings" onClick={onClose}><X size={18} weight="bold" /></button>
      <span className="settings-close-hint" aria-hidden="true">ESC</span>
    </div>
  );
}
