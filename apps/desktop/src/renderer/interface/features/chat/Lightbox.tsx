import { ArrowSquareOut, CaretLeft, CaretRight, Copy, DownloadSimple, Minus, Plus, X } from '@phosphor-icons/react';
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react';
import { createPortal } from 'react-dom';
import { useLightboxStore } from '@discordy/core/application/stores/lightboxStore';
import { clampPan, clampZoom, displayFilename, MIN_ZOOM, swipeDirection } from '@discordy/core/domain/media';
import { copyImage, saveImage } from '../../app/messageActions';
import { AssetImage } from '../../shared/ui/AssetImage';
import { IconButton } from '../../shared/ui/IconButton';
import { MediaPlayer } from './MediaPlayer';

const ZOOM_STEP = 1.5;

interface View {
  zoom: number;
  x: number;
  y: number;
}

const RESET: View = { zoom: MIN_ZOOM, x: 0, y: 0 };

/** Full-screen viewer for the images and videos of one message: zoom and pan, arrow navigation, original, save, copy. */
export function Lightbox() {
  const items = useLightboxStore((s) => s.items);
  const index = useLightboxStore((s) => s.index);
  const step = useLightboxStore((s) => s.step);
  const close = useLightboxStore((s) => s.close);
  const [view, setView] = useState<View>(RESET);
  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const item = items[index];
  const open = items.length > 0;

  useEffect(() => setView(RESET), [index, open]);

  const zoomBy = useCallback((factor: number) => {
    setView((v) => {
      const zoom = clampZoom(v.zoom * factor);
      const box = stage.current?.getBoundingClientRect();
      return zoom === MIN_ZOOM ? RESET : { zoom, x: clampPan(v.x, box?.width ?? 0, zoom), y: clampPan(v.y, box?.height ?? 0, zoom) };
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight') step(1);
      else if (e.key === 'ArrowLeft') step(-1);
      else if (e.key === '+' || e.key === '=') zoomBy(ZOOM_STEP);
      else if (e.key === '-') zoomBy(1 / ZOOM_STEP);
      else if (e.key === '0') setView(RESET);
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, close, step, zoomBy]);

  if (!item) return null;

  const onWheel = (e: ReactWheelEvent) => {
    if (item.kind !== 'image') return;
    zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15);
  };
  const onPointerDown = (e: ReactPointerEvent) => {
    if (item.kind !== 'image') return;
    if (view.zoom > MIN_ZOOM) e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, ox: view.x, oy: view.y };
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    const box = stage.current?.getBoundingClientRect();
    if (!d || !box || view.zoom === MIN_ZOOM) return;
    setView((v) => ({ ...v, x: clampPan(d.ox + e.clientX - d.x, box.width, v.zoom), y: clampPan(d.oy + e.clientY - d.y, box.height, v.zoom) }));
  };
  const endDrag = () => {
    drag.current = null;
  };
  /** Zoomed out, a horizontal swipe turns to the next or previous image. */
  const onPointerUp = (e: ReactPointerEvent) => {
    const d = drag.current;
    endDrag();
    if (d && view.zoom === MIN_ZOOM) step(swipeDirection(e.clientX - d.x, e.clientY - d.y));
  };
  const name = displayFilename(item.filename);

  return createPortal(
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={`Viewing ${name}`}>
      <div className="lightbox-backdrop" onClick={close} />
      <div className="lightbox-bar">
        <span className="lightbox-title">{name}{items.length > 1 ? <span className="lightbox-count tnum"> · {index + 1} of {items.length}</span> : null}</span>
        <div className="lightbox-actions">
          {item.kind === 'image' && (
            <>
              <IconButton label="Zoom out" onClick={() => zoomBy(1 / ZOOM_STEP)} disabled={view.zoom === MIN_ZOOM}><Minus size={18} /></IconButton>
              <span className="lightbox-zoom tnum" aria-live="polite">{Math.round(view.zoom * 100)}%</span>
              <IconButton label="Zoom in" onClick={() => zoomBy(ZOOM_STEP)}><Plus size={18} /></IconButton>
              <IconButton label="Copy image" onClick={() => void copyImage(item.src)}><Copy size={18} /></IconButton>
            </>
          )}
          <IconButton label="Save as" onClick={() => void saveImage(item.src, name)}><DownloadSimple size={18} /></IconButton>
          <IconButton label="Open original" onClick={() => window.open(item.original, '_blank', 'noopener,noreferrer')}><ArrowSquareOut size={18} /></IconButton>
          <IconButton label="Close" onClick={close}><X size={18} /></IconButton>
        </div>
      </div>
      {items.length > 1 && (
        <>
          <button type="button" className="lightbox-nav is-prev" aria-label="Previous" onClick={() => step(-1)}><CaretLeft size={28} /></button>
          <button type="button" className="lightbox-nav is-next" aria-label="Next" onClick={() => step(1)}><CaretRight size={28} /></button>
        </>
      )}
      <div ref={stage} className="lightbox-stage" onWheel={onWheel} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={endDrag} onClick={(e) => e.target === e.currentTarget && close()} onDoubleClick={() => (view.zoom === MIN_ZOOM ? zoomBy(2.5) : setView(RESET))}>
        {item.kind === 'image' ? (
          <AssetImage key={item.src} className={`lightbox-media${view.zoom > MIN_ZOOM ? ' is-zoomed' : ''}`} candidates={[item.src, ...(item.fallbacks ?? [])]} alt={item.description ?? name} style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }} />
        ) : (
          <div key={item.src} className="lightbox-media lightbox-video"><MediaPlayer kind="video" src={item.src} label={name} autoPlay fullscreen={false} /></div>
        )}
      </div>
      {item.description && <p className="lightbox-caption">{item.description}</p>}
    </div>,
    document.body,
  );
}
