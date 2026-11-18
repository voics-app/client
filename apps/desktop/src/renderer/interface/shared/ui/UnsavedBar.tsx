import { useEffect, useRef } from 'react';
import { useUnsavedStore } from '@discordy/core/application/stores/unsavedStore';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { Button } from './Button';

/** Discord's "Careful, you have unsaved changes" bar. Renders only while `dirty`, and shakes when settings refuse to close. */
export function UnsavedBar({ dirty, saving, error, onReset, onSave }: { dirty: boolean; saving?: boolean; error?: string | null; onReset: () => void; onSave: () => void }) {
  useUnsavedChanges(dirty);
  const shake = useUnsavedStore((s) => s.shake);
  const ref = useRef<HTMLDivElement>(null);
  const seen = useRef(shake);
  useEffect(() => {
    if (shake === seen.current) return;
    seen.current = shake;
    const el = ref.current;
    if (!el) return;
    el.classList.remove('is-shaking');
    void el.offsetWidth;
    el.classList.add('is-shaking');
  }, [shake]);
  if (!dirty) return null;
  return (
    <div ref={ref} className={`save-bar glass${error ? ' has-error' : ''}`} role="status" onAnimationEnd={(e) => e.animationName === 'bar-shake' && e.currentTarget.classList.remove('is-shaking')}>
      {error ? <div className="save-bar-copy"><strong>Your edits are still here.</strong><p className="field-error" role="alert">{error} Try saving again.</p></div> : <span>Careful, you have unsaved changes.</span>}
      <Button variant="ghost" disabled={saving} onClick={onReset}>Reset</Button>
      <Button variant="primary" loading={saving} onClick={onSave}>Save changes</Button>
    </div>
  );
}
