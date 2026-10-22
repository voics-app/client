import { useEffect, useState } from 'react';
import { usePrefsStore } from '@renderer/application/stores/prefsStore';
import { effectiveReduceMotion, effectiveTheme, zoomActionOf, stepZoom } from '@renderer/domain/appearance';
import { bridge } from './bridge';

function useMedia(query: string): boolean {
  const [matches, setMatches] = useState(() => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false));
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia(query);
    const on = () => setMatches(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return matches;
}

/** Applies theme (optionally following the OS), accent, motion, density and the accessibility preferences to the document root and the window zoom. */
export function useAppearance(): void {
  const p = usePrefsStore();
  const osDark = useMedia('(prefers-color-scheme: dark)');
  const osReduce = useMedia('(prefers-reduced-motion: reduce)');
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = effectiveTheme(p.theme, p.syncOsTheme, osDark);
    root.dataset.accent = p.accent;
    root.dataset.reduceMotion = String(effectiveReduceMotion(p.reduceMotion, p.syncOsMotion, osReduce));
    root.dataset.density = p.density;
    root.dataset.sidebarDensity = p.channelListDensity;
    root.dataset.linkUnderline = String(p.linkUnderline);
    root.dataset.highContrast = String(p.highContrast);
    root.dataset.roleColors = p.roleColors;
    root.dataset.compactAvatars = String(p.showAvatarsInCompact);
    root.dataset.desaturated = String(p.saturation < 1);
    root.style.setProperty('--font-scale', String(p.fontScale));
    root.style.setProperty('--message-spacing', `${p.messageSpacing}px`);
    root.style.setProperty('--saturation', String(p.saturation));
  }, [p.theme, p.syncOsTheme, osDark, p.accent, p.reduceMotion, p.syncOsMotion, osReduce, p.density, p.channelListDensity, p.linkUnderline, p.highContrast, p.roleColors, p.showAvatarsInCompact, p.saturation, p.fontScale, p.messageSpacing]);
  useEffect(() => bridge?.app.setZoom?.(p.zoom), [p.zoom]);
}

/** Ctrl +, Ctrl - and Ctrl 0 change the UI zoom; the factor is remembered in the preferences. */
export function handleZoomKey(e: KeyboardEvent): boolean {
  const action = zoomActionOf(e);
  if (!action) return false;
  e.preventDefault();
  const prefs = usePrefsStore.getState();
  prefs.set('zoom', stepZoom(prefs.zoom, action));
  return true;
}
