import { describe, expect, it, vi } from 'vitest';
import { GlobalKeybinds, HookHub, PushToTalk, sanitizeSpecs } from '../../../src/main/hotkeys';

function fakeHook() {
  const handlers: Record<string, (e: { keycode: number }) => void> = {};
  return { handlers, start: vi.fn(), stop: vi.fn(), on: (ev: string, fn: (e: { keycode: number }) => void) => void (handlers[ev] = fn) };
}

const CTRL = 29;
const SHIFT = 42;
const M = 50;

describe('HookHub', () => {
  it('starts once, stops when the last listener leaves and reports an unavailable hook', () => {
    const hook = fakeHook();
    const hub = new HookHub(() => hook);
    const a = { down: vi.fn(), up: vi.fn() };
    const b = { down: vi.fn(), up: vi.fn() };
    expect(hub.add(a)).toBe(true);
    expect(hub.add(b)).toBe(true);
    expect(hook.start).toHaveBeenCalledTimes(1);
    hook.handlers.keydown!({ keycode: 5 });
    expect(a.down).toHaveBeenCalledWith(5);
    expect(b.down).toHaveBeenCalledWith(5);
    hub.remove(a);
    expect(hook.stop).not.toHaveBeenCalled();
    hub.remove(b);
    expect(hook.stop).toHaveBeenCalledTimes(1);
    expect(new HookHub(() => null).add(a)).toBe(false);
  });
});

describe('GlobalKeybinds', () => {
  const setup = () => {
    const specs = [
      { id: 'mute', ctrl: true, alt: false, shift: true, keycode: M, hold: false },
      { id: 'ptm', ctrl: false, alt: false, shift: false, keycode: 57, hold: true },
    ];
    const hook = fakeHook();
    const sent: [string, boolean][] = [];
    const g = new GlobalKeybinds(() => null, new HookHub(() => hook), (id, pressed) => sent.push([id, pressed]));
    expect(g.configure(specs)).toBe(true);
    const press = (k: number) => hook.handlers.keydown!({ keycode: k });
    const release = (k: number) => hook.handlers.keyup!({ keycode: k });
    return { g, hook, sent, press, release };
  };
  it('fires when the exact modifiers are held and ignores partial modifiers', () => {
    const { sent, press, release } = setup();
    press(M);
    release(M);
    press(CTRL);
    press(M);
    release(M);
    expect(sent).toEqual([]);
    press(SHIFT);
    press(M);
    expect(sent).toEqual([['mute', true]]);
  });
  it('does not repeat on auto-repeat and reports the release only for held actions', () => {
    const { sent, press, release } = setup();
    press(57);
    press(57);
    release(57);
    expect(sent).toEqual([['ptm', true], ['ptm', false]]);
    press(CTRL);
    press(SHIFT);
    press(M);
    release(M);
    expect(sent.filter(([id]) => id === 'mute')).toEqual([['mute', true]]);
  });
  it('releases a held action when unregistered and stops the hook with no specs', () => {
    const { g, hook, sent, press } = setup();
    press(57);
    g.configure([]);
    expect(sent).toEqual([['ptm', true], ['ptm', false]]);
    expect(hook.stop).toHaveBeenCalled();
  });
  it('shares the hook with push-to-talk', () => {
    const hook = fakeHook();
    const hub = new HookHub(() => hook);
    const events: boolean[] = [];
    const ptt = new PushToTalk(() => ({ webContents: { send: (_c: string, v: boolean) => events.push(v) } }) as never, hub);
    const g = new GlobalKeybinds(() => null, hub, () => undefined);
    ptt.configure(47);
    g.configure([{ id: 'x', ctrl: false, alt: false, shift: false, keycode: 1, hold: false }]);
    expect(hook.start).toHaveBeenCalledTimes(1);
    hook.handlers.keydown!({ keycode: 47 });
    hook.handlers.keyup!({ keycode: 47 });
    expect(events).toEqual([true, false]);
    g.configure([]);
    expect(hook.stop).not.toHaveBeenCalled();
  });
});

describe('sanitizeSpecs', () => {
  it('drops malformed entries and coerces flags', () => {
    expect(sanitizeSpecs([{ id: 'a', keycode: 5, ctrl: 1 }, { id: 3 }, null, { id: 'b', keycode: 'x' }])).toEqual([{ id: 'a', keycode: 5, ctrl: false, alt: false, shift: false, hold: false }]);
    expect(sanitizeSpecs('nope')).toEqual([]);
  });
});
