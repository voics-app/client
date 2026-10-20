/** Electron adapter for the attention port: taskbar overlay/badge, window title, tray. */
import { app, nativeImage, type BrowserWindow } from 'electron';
import type { Bitmap } from './badgeBitmap';
import type { AttentionPort } from './presenter';

const toImage = (b: Bitmap) => nativeImage.createFromBitmap(b.data, { width: b.width, height: b.height });

export function createElectronAttentionPort(getWindow: () => BrowserWindow | null, getTray: () => { setState(image: Bitmap | null, tooltip: string): void } | null): AttentionPort {
  return {
    setOverlay: (image, description) => getWindow()?.setOverlayIcon(image ? toImage(image) : null, description),
    setBadgeCount: (count) => void app.setBadgeCount(count),
    setTitle: (title) => getWindow()?.setTitle(title),
    setTray: (image, tooltip) => getTray()?.setState(image, tooltip),
  };
}
