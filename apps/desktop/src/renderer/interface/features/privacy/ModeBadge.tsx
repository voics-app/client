import { useI18n } from '../../shared/i18n';
import { Globe, LockKey, Plugs } from '@phosphor-icons/react';
import type { DeliveryMode } from '@discordy/core/contracts/rest';
import { brand } from '@discordy/core/domain/brandConfig';
import { MODE_COPY } from '@discordy/core/domain/deliveryMode';
import { Tooltip } from '../../shared/ui/Tooltip';

const ICON = { standard: Globe, ephemeral: LockKey, p2p: Plugs } as const;

/** The always-visible delivery-mode marker. Colour, icon and label all carry the mode. */
export function ModeBadge({ mode, compact, onClick, detail }: { mode: DeliveryMode; compact?: boolean; onClick?: () => void; detail?: string }) {
  const { t } = useI18n();
  const Icon = ICON[mode];
  const copy = MODE_COPY[mode];
  const body = (
    <>
      <Icon size={compact ? 12 : 14} weight={mode === 'standard' ? 'regular' : 'fill'} />
      <span>{compact ? copy.short : copy.label}</span>
      {detail && <span className="mode-detail">{detail}</span>}
    </>
  );
  const props = { className: `mode-badge mode-${mode}${compact ? ' is-compact' : ''}`, 'data-mode': mode };
  return (
    <Tooltip label={<span>{t(`mode.${mode}Description`, { app: brand().displayName })}</span>} side="bottom">
      {onClick ? (
        <button type="button" onClick={onClick} {...props} aria-label={t('mode.change', { name: copy.label })}>
          {body}
        </button>
      ) : (
        <span {...props} role="status" aria-label={t('mode.label', { name: copy.label })} tabIndex={0}>
          {body}
        </span>
      )}
    </Tooltip>
  );
}
