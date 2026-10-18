import { cloneElement, useCallback, useRef, useState, type FocusEvent, type MouseEvent, type ReactElement, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

type Side = 'top' | 'right' | 'bottom' | 'left';

interface Props {
  label: ReactNode;
  side?: Side;
  children: ReactElement<TriggerProps>;
  delay?: number;
}

interface TriggerProps {
  onMouseEnter?: (e: MouseEvent<HTMLElement>) => void;
  onMouseLeave?: (e: MouseEvent<HTMLElement>) => void;
  onFocus?: (e: FocusEvent<HTMLElement>) => void;
  onBlur?: (e: FocusEvent<HTMLElement>) => void;
}

/** Glass tooltip positioned from the trigger rect. Triggered by hover and keyboard focus. */
export function Tooltip({ label, side = 'top', children, delay = 350 }: Props) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(
    (el: HTMLElement) => {
      timer.current = setTimeout(() => {
        const r = el.getBoundingClientRect();
        const gap = 10;
        const map: Record<Side, { x: number; y: number }> = {
          top: { x: r.left + r.width / 2, y: r.top - gap },
          bottom: { x: r.left + r.width / 2, y: r.bottom + gap },
          left: { x: r.left - gap, y: r.top + r.height / 2 },
          right: { x: r.right + gap, y: r.top + r.height / 2 },
        };
        setPos(map[side]);
      }, delay);
    },
    [delay, side],
  );
  const hide = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setPos(null);
  }, []);

  const own = children.props;
  const trigger = cloneElement(children, {
    onMouseEnter: (e) => {
      own.onMouseEnter?.(e);
      show(e.currentTarget);
    },
    onMouseLeave: (e) => {
      own.onMouseLeave?.(e);
      hide();
    },
    onFocus: (e) => {
      own.onFocus?.(e);
      if (e.currentTarget.matches(':focus-visible')) show(e.currentTarget);
    },
    onBlur: (e) => {
      own.onBlur?.(e);
      hide();
    },
  });

  return (
    <>
      {trigger}
      {pos &&
        createPortal(
          <div className={`tooltip tooltip-${side} glass`} style={{ left: pos.x, top: pos.y }} role="tooltip">
            {label}
          </div>,
          document.body,
        )}
    </>
  );
}
