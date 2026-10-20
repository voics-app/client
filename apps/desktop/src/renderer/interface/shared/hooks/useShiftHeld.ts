import { useEffect, useState } from 'react';

/** Tracks whether Shift is held while `active`. Resets when inactive or when the window loses focus. */
export function useShiftHeld(active: boolean): [boolean, (v: boolean) => void] {
  const [shift, setShift] = useState(false);
  useEffect(() => {
    if (!active) {
      setShift(false);
      return;
    }
    const sync = (e: KeyboardEvent) => setShift(e.shiftKey);
    const off = () => setShift(false);
    window.addEventListener('keydown', sync);
    window.addEventListener('keyup', sync);
    window.addEventListener('blur', off);
    return () => {
      window.removeEventListener('keydown', sync);
      window.removeEventListener('keyup', sync);
      window.removeEventListener('blur', off);
    };
  }, [active]);
  return [shift, setShift];
}
