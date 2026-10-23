/**
 * System-wide key handling. Electron's globalShortcut has no key-up events, so push-to-talk, push-to-mute
 * and the global keybinds all share one uiohook-napi hook (optional dependency, started on first use and
 * stopped when nobody listens). Without the module, global scope is unavailable and everything stays window-focused.
 */
import type { BrowserWindow } from 'electron';
import { IpcChannel, type GlobalKeybindSpec } from '../shared/ipc';

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

export interface HookListener {
  down(keycode: number): void;
  up(keycode: number): void;
}

/** One shared native hook fanned out to any number of listeners. */
export class HookHub {
  private hook: UiohookLike | null = null;
  private wired = false;
  private readonly listeners = new Set<HookListener>();

  constructor(private readonly load: () => UiohookLike | null = loadHook) {}

  /** Returns false when the native hook is unavailable. */
  add(listener: HookListener): boolean {
    if (this.listeners.has(listener)) return true;
    this.hook ??= this.load();
    if (!this.hook) return false;
    if (!this.wired) {
      this.wired = true;
      this.hook.on('keydown', (e) => this.listeners.forEach((l) => l.down(e.keycode)));
      this.hook.on('keyup', (e) => this.listeners.forEach((l) => l.up(e.keycode)));
    }
    if (this.listeners.size === 0) this.hook.start();
    this.listeners.add(listener);
    return true;
  }

  remove(listener: HookListener): void {
    if (!this.listeners.delete(listener)) return;
    if (this.listeners.size === 0) this.hook?.stop();
  }

  dispose(): void {
    this.listeners.clear();
    this.hook?.stop();
  }
}

export class PushToTalk implements HookListener {
  private keycode: number | null = null;
  private pressed = false;

  constructor(private readonly window: () => BrowserWindow | null, private readonly hub: HookHub = new HookHub()) {}

  /** Returns false when global hooks are unavailable on this platform. */
  configure(keycode: number | null): boolean {
    this.keycode = keycode;
    if (keycode === null) {
      this.hub.remove(this);
      return true;
    }
    return this.hub.add(this);
  }

  down(keycode: number): void {
    this.emit(keycode, true);
  }

  up(keycode: number): void {
    this.emit(keycode, false);
  }

  private emit(keycode: number, pressed: boolean): void {
    if (keycode !== this.keycode || pressed === this.pressed) return;
    this.pressed = pressed;
    this.window()?.webContents.send(IpcChannel.hotkeyPttEvent, pressed);
  }

  dispose(): void {
    this.hub.remove(this);
  }
}

const MODS = { shift: [42, 54], ctrl: [29, 3613, 3675, 3676], alt: [56, 3640] } as const;

export function sanitizeSpecs(raw: unknown): GlobalKeybindSpec[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((r): GlobalKeybindSpec[] => {
    const s = r as Partial<GlobalKeybindSpec> | null;
    if (!s || typeof s.id !== 'string' || typeof s.keycode !== 'number') return [];
    return [{ id: s.id, keycode: s.keycode, ctrl: s.ctrl === true, alt: s.alt === true, shift: s.shift === true, hold: s.hold === true }];
  });
}

/** Fires renderer actions for key combinations pressed anywhere in the OS; held actions also report the release. */
export class GlobalKeybinds implements HookListener {
  private specs: GlobalKeybindSpec[] = [];
  private readonly held = new Set<number>();
  private readonly active = new Set<string>();

  constructor(private readonly window: () => BrowserWindow | null, private readonly hub: HookHub = new HookHub(), private readonly send?: (id: string, pressed: boolean) => void) {}

  /** Replaces the registered combinations; false when the native hook is unavailable. */
  configure(specs: GlobalKeybindSpec[]): boolean {
    this.releaseAll();
    this.specs = specs;
    if (specs.length === 0) {
      this.hub.remove(this);
      return true;
    }
    return this.hub.add(this);
  }

  private mod(kind: keyof typeof MODS): boolean {
    return MODS[kind].some((k) => this.held.has(k));
  }

  down(keycode: number): void {
    this.held.add(keycode);
    for (const s of this.specs) {
      if (s.keycode !== keycode || this.active.has(s.id)) continue;
      if (s.ctrl !== this.mod('ctrl') || s.alt !== this.mod('alt') || s.shift !== this.mod('shift')) continue;
      this.active.add(s.id);
      this.emit(s.id, true);
    }
  }

  up(keycode: number): void {
    this.held.delete(keycode);
    for (const s of this.specs) {
      if (!this.active.has(s.id)) continue;
      const released = s.keycode === keycode || (s.ctrl && !this.mod('ctrl')) || (s.alt && !this.mod('alt')) || (s.shift && !this.mod('shift'));
      if (!released) continue;
      this.active.delete(s.id);
      if (s.hold) this.emit(s.id, false);
    }
  }

  private releaseAll(): void {
    for (const s of this.specs) if (this.active.has(s.id) && s.hold) this.emit(s.id, false);
    this.active.clear();
  }

  private emit(id: string, pressed: boolean): void {
    if (this.send) this.send(id, pressed);
    else this.window()?.webContents.send(IpcChannel.hotkeyGlobalEvent, { id, pressed });
  }

  dispose(): void {
    this.hub.remove(this);
  }
}
