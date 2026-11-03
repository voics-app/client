import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Tooltip } from './Tooltip';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  /** Shortcut shown after the label in the tooltip (not part of the accessible name). */
  hint?: string;
  children: ReactNode;
  active?: boolean;
  tone?: 'default' | 'danger' | 'accent';
  size?: 'sm' | 'md' | 'lg';
  tooltipSide?: 'top' | 'right' | 'bottom' | 'left';
}

export const IconButton = forwardRef<HTMLButtonElement, Props>(function IconButton(
  { label, hint, children, active, tone = 'default', size = 'md', tooltipSide = 'top', className, type = 'button', ...rest },
  ref,
) {
  return (
    // No tooltip while this button's own menu/popover is open (aria-expanded), as in Discord.
    <Tooltip
      label={hint ? <>{label} <kbd className="kbd tooltip-kbd">{hint}</kbd></> : label}
      side={tooltipSide}
      suppressed={rest['aria-expanded'] === true || rest['aria-expanded'] === 'true'}
    >
      <button
        ref={ref}
        type={type}
        aria-label={label}
        aria-pressed={active}
        className={`icon-btn icon-btn-${size} icon-btn-${tone}${active ? ' is-active' : ''}${className ? ` ${className}` : ''}`}
        {...rest}
      >
        {children}
      </button>
    </Tooltip>
  );
});
