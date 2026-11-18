import { X } from '@phosphor-icons/react';
import { useI18n } from '../../shared/i18n';

/** Discord's round X with an "ESC" caption at the top right of the settings content. */
export function SettingsCloseButton({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  return (
    <div className="settings-close">
      <button type="button" className="settings-close-btn" aria-label={t('settings.close')} onClick={onClose}><X size={18} weight="bold" /></button>
      <span className="settings-close-hint" aria-hidden="true">ESC</span>
    </div>
  );
}
