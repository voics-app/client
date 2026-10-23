/** Maps browser `KeyboardEvent.code` values to uiohook (PS/2 set 1 style) keycodes for the global push-to-talk key. */

const ROW: Record<string, number> = {
  KeyQ: 16, KeyW: 17, KeyE: 18, KeyR: 19, KeyT: 20, KeyY: 21, KeyU: 22, KeyI: 23, KeyO: 24, KeyP: 25,
  KeyA: 30, KeyS: 31, KeyD: 32, KeyF: 33, KeyG: 34, KeyH: 35, KeyJ: 36, KeyK: 37, KeyL: 38,
  KeyZ: 44, KeyX: 45, KeyC: 46, KeyV: 47, KeyB: 48, KeyN: 49, KeyM: 50,
  Digit1: 2, Digit2: 3, Digit3: 4, Digit4: 5, Digit5: 6, Digit6: 7, Digit7: 8, Digit8: 9, Digit9: 10, Digit0: 11,
  Minus: 12, Equal: 13, Tab: 15, Space: 57, CapsLock: 58, Backquote: 41, Backslash: 43,
  BracketLeft: 26, BracketRight: 27, Semicolon: 39, Quote: 40, Comma: 51, Period: 52, Slash: 53,
  ShiftLeft: 42, ShiftRight: 54, ControlLeft: 29, ControlRight: 3613, AltLeft: 56, AltRight: 3640,
  F1: 59, F2: 60, F3: 61, F4: 62, F5: 63, F6: 64, F7: 65, F8: 66, F9: 67, F10: 68, F11: 87, F12: 88,
  ArrowUp: 57416, ArrowLeft: 57419, ArrowRight: 57421, ArrowDown: 57424,
  Insert: 57426, Delete: 57427, Home: 57415, End: 57423, PageUp: 57417, PageDown: 57425,
  Backspace: 14, Enter: 28,
};

export function uiohookKeycode(code: string): number | null {
  return ROW[code] ?? null;
}

const LABELS: Record<string, string> = { Space: 'Space', ShiftLeft: 'Left Shift', ShiftRight: 'Right Shift', ControlLeft: 'Left Ctrl', ControlRight: 'Right Ctrl', AltLeft: 'Left Alt', AltRight: 'Right Alt', Backquote: '`' };

export function keyLabel(code: string): string {
  return LABELS[code] ?? code.replace(/^Key|^Digit/, '');
}

const PUNCT: Record<string, string> = { Minus: '-', Equal: '=', Backquote: '`', Backslash: '\\',BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/' };
const MODIFIER_CODES = new Set(['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'CapsLock']);

const BY_NAME: Record<string, number> = { Escape: 1 };
for (const [code, keycode] of Object.entries(ROW)) {
  if (!MODIFIER_CODES.has(code)) BY_NAME[PUNCT[code] ?? code.replace(/^Key|^Digit/, '')] = keycode;
}

/** Keycode for a key name as written by describeEvent (`M`, `ArrowUp`, `Space`, `F5`, `,`); null when the native hook has no code for it. */
export function keyNameCode(name: string): number | null {
  return BY_NAME[name] ?? null;
}
