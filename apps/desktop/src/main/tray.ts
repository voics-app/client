import { Menu, Tray, app, nativeImage, type BrowserWindow } from 'electron';
import { join } from 'node:path';
import { BRAND } from '../shared/brand';

export function createTray(getWindow: () => BrowserWindow | null, onQuit: () => void): Tray {
  const icon = nativeImage.createFromPath(join(__dirname, '../../resources/tray.png'));
  const tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon.resize({ width: 16, height: 16 }));
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
  return tray;
}
