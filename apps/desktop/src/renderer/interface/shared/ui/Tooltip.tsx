import { cloneElement, useCallback, useEffect, useLayoutEffect, useRef, useState, type FocusEvent, type MouseEvent, type ReactElement, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { placeTooltip, type Placement, type Rect, type Side } from './tooltipPlacement';

interface Props {
  label: ReactNode;
  side?: Side;
  children: ReactElement<TriggerProps>;
  delay?: number;
  /** Hide and never open while true, e.g. while the trigger's own menu or popover is open (like Discord). */
  suppressed?: boolean;
}

interface TriggerProps {
  onMouseEnter?: (e: MouseEvent<HTMLElement>) => void;
  onMouseLeave?: (e: MouseEvent<HTMLElement>) => void;
  onFocus?: (e: FocusEvent<HTMLElement>) => void;
  onBlur?: (e: FocusEvent<HTMLElement>) => void;
}

interface Shown {
  rect: Rect;
  side: Side;
}

/** Glass tooltip rendered in a body-level portal (so no overflow:hidden ancestor can clip it), clamped to the viewport.
 * Triggered by hover and keyboard focus; dismissed on scroll or resize so it never floats detached from its trigger. */
export function Tooltip({ label, side = 'top', children, delay = 350, suppressed = false }: Props) {
  const [shown, setShown] = useState<Shown | null>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelTimer = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const show = useCallback(
    (el: HTMLElement) => {
      cancelTimer();
      if (suppressed) return;
      timer.current = setTimeout(() => {
        const r = el.getBoundingClientRect();
        setShown({ rect: { top: r.top, right: r.right, bottom: r.bottom, left: r.left, width: r.width, height: r.height }, side });
      }, delay);
    },
    [cancelTimer, delay, side, suppressed],
  );
  const hide = useCallback(() => {
    cancelTimer();
    setShown(null);
    setPlacement(null);
  }, [cancelTimer]);

  useEffect(() => {
    if (suppressed) hide();
  }, [suppressed, hide]);

  useLayoutEffect(() => {
    const tip = tipRef.current;
    if (!shown || !tip) return;
    setPlacement(
      placeTooltip(shown.rect, shown.side, { width: tip.offsetWidth, height: tip.offsetHeight }, { width: window.innerWidth, height: window.innerHeight }),
    );
  }, [shown]);

  useEffect(() => {
    if (!shown) return;
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    return () => {
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
    };
  }, [shown, hide]);

  useEffect(() => () => cancelTimer(), [cancelTimer]);

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

  const placedSide = placement?.side ?? side;
  return (
    <>
      {trigger}
      {shown &&
        createPortal(
          <div
            ref={tipRef}
            className={`tooltip tooltip-${placedSide} glass`}
            style={placement ? { left: placement.x, top: placement.y } : { left: 0, top: 0, visibility: 'hidden' }}
            role="tooltip"
          >
            {label}
          </div>,
          document.body,
        )}
    </>
  );
}
