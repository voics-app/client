import { Menu, Tray, app, nativeImage, type BrowserWindow } from 'electron';
import { join } from 'node:path';

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
  tray.setToolTip('Discordy');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Discordy', click: show },
      { type: 'separator' },
      { label: `Version ${app.getVersion()}`, enabled: false },
      { label: 'Quit Discordy', click: onQuit },
    ]),
  );
  tray.on('click', show);
  return tray;
}
