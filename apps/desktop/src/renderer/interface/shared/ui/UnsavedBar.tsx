import { useEffect, useRef } from 'react';
import { useUnsavedStore } from '@discordy/core/application/stores/unsavedStore';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { Button } from './Button';
import { useI18n } from '../i18n';

/** Discord's "Careful, you have unsaved changes" bar. Renders only while `dirty`, and shakes when settings refuse to close. */
export function UnsavedBar({ dirty, saving, onReset, onSave }: { dirty: boolean; saving?: boolean; onReset: () => void; onSave: () => void }) {
  const { t } = useI18n();
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
    <div ref={ref} className="save-bar glass" role="status" onAnimationEnd={(e) => e.animationName === 'bar-shake' && e.currentTarget.classList.remove('is-shaking')}>
      <span>{t('common.unsaved')}</span>
      <Button variant="ghost" disabled={saving} onClick={onReset}>{t('common.reset')}</Button>
      <Button variant="primary" loading={saving} onClick={onSave}>{t('common.saveChanges')}</Button>
    </div>
  );
}
