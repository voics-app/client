import { useI18n } from '../../shared/i18n';
import { useState } from 'react';
import { bannerFor, useUpdateStore } from '@discordy/core/application/stores/updateStore';
import { bridge } from '../../app/bridge';
import { Button } from '../../shared/ui/Button';

/** Non-blocking update prompt: available, downloading, then "Restart to update" with release notes. */
export function UpdateBanner() {
  const { t: msg, number } = useI18n();
  const status = useUpdateStore((s) => s.status);
  const dismissed = useUpdateStore((s) => s.dismissed);
  const dismiss = useUpdateStore((s) => s.dismiss);
  const [showNotes, setShowNotes] = useState(false);
  const model = bannerFor(status, dismissed);
  if (!model) return null;
  return (
    <div className="update-banner" role="status" aria-live="polite">
      <div className="update-banner-row">
        <span className="update-banner-text">
          {model.kind === 'available' && msg('updates.available', { version: model.version })}
          {model.kind === 'downloading' && msg('updates.downloading', { progress: number(model.percent / 100, { style: 'percent', maximumFractionDigits: 0 }) })}
          {model.kind === 'ready' && msg('updates.ready', { version: model.version })}
        </span>
        {model.kind === 'ready' && (
          <>
            {model.notes && <Button variant="secondary" onClick={() => setShowNotes((v) => !v)} aria-expanded={showNotes}>{msg("settings.updatebanner.what.is.new")}</Button>}
            <Button variant="primary" onClick={() => bridge?.updates.install()}>{msg("settings.updatebanner.restart.to.update")}</Button>
          </>
        )}
        {model.kind !== 'downloading' && <Button variant="secondary" onClick={() => dismiss(model.version)}>{msg("settings.updatebanner.later")}</Button>}
      </div>
      {model.kind === 'ready' && showNotes && model.notes && <pre className="update-banner-notes">{model.notes}</pre>}
    </div>
  );
}
