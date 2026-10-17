/**
 * Global push-to-talk. Electron's globalShortcut has no key-up events, so we
 * use uiohook-napi (optional dependency) for system-wide key down/up.
 */
import type { BrowserWindow } from 'electron';
import { IpcChannel } from '../shared/ipc';

interface UiohookKeyEvent {
  keycode: number;
}
interface UiohookLike {
  on(event: 'keydown' | 'keyup', listener: (e: UiohookKeyEvent) => void): void;
  start(): void;
  stop(): void;
}

function loadHook(): UiohookLike | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return (require('uiohook-napi') as { uIOhook: UiohookLike }).uIOhook;
  } catch {
    return null;
  }
}

export class PushToTalk {
  private hook: UiohookLike | null = null;
  private keycode: number | null = null;
  private pressed = false;

  constructor(private readonly window: () => BrowserWindow | null) {}

  /** Returns false when global hooks are unavailable on this platform. */
  configure(keycode: number | null): boolean {
    this.keycode = keycode;
    if (keycode === null) {
      this.hook?.stop();
      this.hook = null;
      return true;
    }
    if (this.hook) return true;
    this.hook = loadHook();
    if (!this.hook) return false;
    this.hook.on('keydown', (e) => this.emit(e.keycode, true));
    this.hook.on('keyup', (e) => this.emit(e.keycode, false));
    this.hook.start();
    return true;
  }

  private emit(keycode: number, pressed: boolean): void {
    if (keycode !== this.keycode || pressed === this.pressed) return;
    this.pressed = pressed;
    this.window()?.webContents.send(IpcChannel.hotkeyPttEvent, pressed);
  }

  dispose(): void {
    this.hook?.stop();
  }
}
