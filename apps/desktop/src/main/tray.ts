import { Menu, Tray, app, nativeImage, type BrowserWindow, type MenuItemConstructorOptions, type NativeImage } from 'electron';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { BRAND } from '../shared/brand';
import type { ActivityCounts, TrayCommand, VoiceState } from '../shared/ipc';
import type { Bitmap } from './attention/badgeBitmap';
import { buildTrayMenu, type TrayMenuItem } from './desktop/trayModel';

export interface TrayHandle {
  tray: Tray;
  /** The plain 16x16 icon as BGRA, the base for unread/mention variants. */
  baseBitmap: Bitmap | null;
  setState(image: Bitmap | null, tooltip: string): void;
  setActivity(activity: ActivityCounts): void;
  setVoice(voice: VoiceState): void;
}

function loadBase(): NativeImage {
  const dir = join(__dirname, '../../resources');
  const file = existsSync(join(dir, 'tray.png')) ? 'tray.png' : 'icon.png';
  const icon = nativeImage.createFromPath(join(dir, file));
  return icon.isEmpty() ? icon : icon.resize({ width: 16, height: 16 });
}

export function createTray(getWindow: () => BrowserWindow | null, onQuit: () => void, onCommand: (command: TrayCommand) => void): TrayHandle {
  const icon = loadBase();
  const tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  const show = () => {
    const w = getWindow();
    if (!w) return;
    if (w.isMinimized()) w.restore();
    w.show();
    w.focus();
  };
  let activity: ActivityCounts = { mentions: 0, unread: 0 };
  let voice: VoiceState = { muted: false, deafened: false };
  const toElectron = (item: TrayMenuItem): MenuItemConstructorOptions => {
    if (item.kind === 'separator') return { type: 'separator' };
    const run = () => {
      if (item.action === 'open') show();
      else if (item.action === 'quit') onQuit();
      else if (item.action) onCommand(item.action);
    };
    return {
      label: item.label,
      enabled: item.enabled ?? true,
      ...(item.checked !== undefined ? { type: 'checkbox' as const, checked: item.checked } : {}),
      ...(item.action ? { click: run } : {}),
    };
  };
  const rebuild = () =>
    tray.setContextMenu(Menu.buildFromTemplate(buildTrayMenu({ brand: BRAND.displayName, version: app.getVersion(), activity, voice }).map(toElectron)));
  tray.setToolTip(BRAND.displayName);
  rebuild();
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
    setActivity(next) {
      activity = next;
      rebuild();
    },
    setVoice(next) {
      voice = next;
      rebuild();
    },
  };
}
