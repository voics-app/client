import { useState } from 'react';
import { bannerFor, useUpdateStore } from '@discordy/core/application/stores/updateStore';
import { bridge } from '../../app/bridge';
import { Button } from '../../shared/ui/Button';

/** Non-blocking update prompt: available, downloading, then "Restart to update" with release notes. */
export function UpdateBanner() {
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
          {model.kind === 'available' && `Update ${model.version} found, downloading`}
          {model.kind === 'downloading' && `Downloading update ${model.percent}%`}
          {model.kind === 'ready' && `Update ${model.version} is ready`}
        </span>
        {model.kind === 'ready' && (
          <>
            {model.notes && <Button variant="secondary" onClick={() => setShowNotes((v) => !v)} aria-expanded={showNotes}>What is new</Button>}
            <Button variant="primary" onClick={() => bridge?.updates.install()}>Restart to update</Button>
          </>
        )}
        {model.kind !== 'downloading' && <Button variant="secondary" onClick={() => dismiss(model.version)}>Later</Button>}
      </div>
      {model.kind === 'ready' && showNotes && model.notes && <pre className="update-banner-notes">{model.notes}</pre>}
    </div>
  );
}
