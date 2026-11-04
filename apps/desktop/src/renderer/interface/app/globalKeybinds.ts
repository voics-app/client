/** Registers the keybinds marked Global with the main process so they fire while the app is unfocused. */
import { usePrefsStore } from '@discordy/core/application/stores/prefsStore';
import { globalSpecs, type KeybindAction } from '@discordy/core/domain/keybinds';
import { bridge } from './bridge';

let active = new Set<string>();

/** True while the native hook delivers this bind system-wide, so the window handler must not fire it a second time. */
export const isGloballyHandled = (id: string): boolean => active.has(id);

/** Whether this build can offer the Global option at all (desktop with the key-hook bridge). */
export const globalKeybindsSupported = (): boolean => Boolean(bridge?.hotkeys.setGlobalKeybinds);

export function startGlobalKeybinds(run: (action: KeybindAction, pressed: boolean) => void): () => void {
  const hotkeys = bridge?.hotkeys;
  if (!hotkeys?.setGlobalKeybinds) return () => undefined;
  let seq = 0;
  const sync = async (): Promise<void> => {
    seq += 1;
    const mine = seq;
    const specs = globalSpecs(usePrefsStore.getState().keybinds);
    let ok = false;
    try {
      ok = await hotkeys.setGlobalKeybinds(specs);
    } catch {
      ok = false;
    }
    if (mine === seq) active = ok ? new Set(specs.map((s) => s.id)) : new Set();
  };
  void sync();
  const unsubscribe = usePrefsStore.subscribe((state, prev) => {
    if (state.keybinds !== prev.keybinds) void sync();
  });
  const off = hotkeys.onGlobalKeybind(({ id, pressed }) => {
    const bind = usePrefsStore.getState().keybinds.find((k) => k.id === id);
    if (bind) run(bind.action, pressed);
  });
  return () => {
    unsubscribe();
    off();
    active = new Set();
  };
}
