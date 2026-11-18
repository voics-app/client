import { useI18n } from '../i18n';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle, Info, Warning, WarningOctagon, X } from '@phosphor-icons/react';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import { gentle } from './motion';

const ICONS = { info: Info, success: CheckCircle, warning: Warning, danger: WarningOctagon };

export function Toasts() {
  const { t: msg } = useI18n();
  const toasts = useUiStore((s) => s.toasts);
  const dismiss = useUiStore((s) => s.dismissToast);
  return (
    <div className="toasts" aria-live="polite">
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const Icon = ICONS[t.tone];
          return (
            <motion.div
              key={t.id}
              layout
              className={`toast glass tone-${t.tone}`}
              initial={{ opacity: 0, x: 32, scale: 0.96 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 24 }}
              transition={gentle}
            >
              <Icon size={20} weight="fill" className="toast-icon" />
              <div className="toast-copy">
                <p className="toast-title">{t.title}</p>
                {t.body && <p className="toast-body">{t.body}</p>}
              </div>
              <button type="button" className="toast-x" aria-label={msg("composer.dismiss")} onClick={() => dismiss(t.id)}>
                <X size={14} />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
