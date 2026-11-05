import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { usePrefsStore } from '@discordy/core/application/stores/prefsStore';
import { effectiveReduceMotion } from '@discordy/core/domain/appearance';

/** True while Reduce Motion is on in the app's Accessibility settings, or in the iPhone's when "Sync with device" is on; animations then shorten to an instant change. */
export function useReduceMotion(): boolean {
  const [system, setSystem] = useState(false);
  const reduceMotion = usePrefsStore((s) => s.reduceMotion);
  const syncOsMotion = usePrefsStore((s) => s.syncOsMotion);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled().then((on) => live && setSystem(on)).catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setSystem);
    return () => {
      live = false;
      sub.remove();
    };
  }, []);
  return effectiveReduceMotion(reduceMotion, syncOsMotion, system);
}
