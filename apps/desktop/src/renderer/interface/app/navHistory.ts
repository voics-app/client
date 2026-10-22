/** Back/forward through visited views (keybinds), fed by every navigation in the UI store. */
import { useUiStore, type View } from '@renderer/application/stores/uiStore';
import { canGo, emptyHistory, pushView, stepHistory, type NavHistory } from '@renderer/domain/navHistory';

let history: NavHistory<View> = emptyHistory();
let stepping = false;
let stop: (() => void) | null = null;

/** Starts recording views; returns a disposer. Safe to call twice (the first recorder keeps running). */
export function startNavHistory(): () => void {
  if (!stop) {
    history = pushView(emptyHistory<View>(), useUiStore.getState().view);
    const unsubscribe = useUiStore.subscribe((state, prev) => {
      if (stepping || state.view === prev.view) return;
      history = pushView(history, state.view);
    });
    stop = () => {
      unsubscribe();
      stop = null;
    };
  }
  return stop;
}

export function goHistory(delta: 1 | -1): void {
  if (!canGo(history, delta)) return;
  history = stepHistory(history, delta);
  stepping = true;
  try {
    useUiStore.getState().navigate(history.entries[history.index]!);
  } finally {
    stepping = false;
  }
}
