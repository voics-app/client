import { Menu, Tray, app, nativeImage, type BrowserWindow, type NativeImage } from 'electron';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { BRAND } from '../shared/brand';
import type { Bitmap } from './attention/badgeBitmap';

export interface TrayHandle {
  tray: Tray;
  /** The plain 16x16 icon as BGRA, the base for unread/mention variants. */
  baseBitmap: Bitmap | null;
  setState(image: Bitmap | null, tooltip: string): void;
}

function loadBase(): NativeImage {
  const dir = join(__dirname, '../../resources');
  const file = existsSync(join(dir, 'tray.png')) ? 'tray.png' : 'icon.png';
  const icon = nativeImage.createFromPath(join(dir, file));
  return icon.isEmpty() ? icon : icon.resize({ width: 16, height: 16 });
}

export function createTray(getWindow: () => BrowserWindow | null, onQuit: () => void): TrayHandle {
  const icon = loadBase();
  const tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  const show = () => {
    const w = getWindow();
    if (!w) return;
    if (w.isMinimized()) w.restore();
    w.show();
    w.focus();
  };
  tray.setToolTip(BRAND.displayName);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: `Open ${BRAND.displayName}`, click: show },
      { type: 'separator' },
      { label: `Version ${app.getVersion()}`, enabled: false },
      { label: `Quit ${BRAND.displayName}`, click: onQuit },
    ]),
  );
  tray.on('click', show);
  const size = icon.getSize();
  const baseBitmap: Bitmap | null = icon.isEmpty() ? null : { width: size.width, height: size.height, data: icon.toBitmap() };
  return {
    tray,
    baseBitmap,
    setState(image, tooltip) {
      tray.setToolTip(tooltip);
      if (image) tray.setImage(nativeImage.createFromBitmap(image.data, { width: image.width, height: image.height }));
    },
  };
}
