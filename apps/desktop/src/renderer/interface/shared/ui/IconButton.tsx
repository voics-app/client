import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Tooltip } from './Tooltip';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  children: ReactNode;
  active?: boolean;
  tone?: 'default' | 'danger' | 'accent';
  size?: 'sm' | 'md' | 'lg';
  tooltipSide?: 'top' | 'right' | 'bottom' | 'left';
}

export const IconButton = forwardRef<HTMLButtonElement, Props>(function IconButton(
  { label, children, active, tone = 'default', size = 'md', tooltipSide = 'top', className, type = 'button', ...rest },
  ref,
) {
  return (
    <Tooltip label={label} side={tooltipSide}>
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
