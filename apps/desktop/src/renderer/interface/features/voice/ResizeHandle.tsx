import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

type Axis = 'horizontal' | 'vertical';

/** Keep both panes usable even after the window is resized. */
export function useCallSplit(axis: Axis) {
  const containerRef = useRef<HTMLElement>(null);
  const [percent, setPercent] = useState(axis === 'vertical' ? 55 : 70);
  const update = (value: number) => setPercent(Math.max(25, Math.min(75, value)));
  return { axis, containerRef, percent, update };
}

type Split = ReturnType<typeof useCallSplit>;

export function ResizeHandle({ split }: { split: Split }) {
  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const rect = split.containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const length = split.axis === 'horizontal' ? rect.width : rect.height;
    if (length > 0) split.update(100 * (split.axis === 'horizontal' ? event.clientX - rect.left : event.clientY - rect.top) / length);
  };
  const keyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const negative = split.axis === 'horizontal' ? 'ArrowLeft' : 'ArrowUp';
    const positive = split.axis === 'horizontal' ? 'ArrowRight' : 'ArrowDown';
    if (event.key === negative || event.key === positive) {
      event.preventDefault();
      split.update(split.percent + (event.key === positive ? 2 : -2));
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      split.update(event.key === 'Home' ? 25 : 75);
    }
  };
  return <div className={`call-resize-handle is-${split.axis}`} role="separator" tabIndex={0}
    aria-label="Resize call and chat" aria-orientation={split.axis === 'horizontal' ? 'vertical' : 'horizontal'}
    aria-valuemin={25} aria-valuemax={75} aria-valuenow={Math.round(split.percent)}
    onKeyDown={keyDown} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); move(event); }} onPointerMove={move} />;
}
