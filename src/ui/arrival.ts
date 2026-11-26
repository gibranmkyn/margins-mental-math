import { useEffect, useState } from 'preact/hooks';

/**
 * A screen reached by a tap ignores taps for its first moments: a quick second tap meant
 * for the button that was there (say, a double tap on "See summary") must not press
 * whatever now sits under the thumb and skip the screen.
 */
export const ARRIVAL_MS = 350;

/**
 * Props for a result screen's buttons: marked aria-disabled, and their presses ignored,
 * until the screen has shown for ARRIVAL_MS. Nothing changes on screen.
 */
export function useArrivalGuard(ms = ARRIVAL_MS) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setReady(true), ms);
    return () => clearTimeout(t);
  }, [ms]);
  return (handler: () => void) => ({
    onClick: () => {
      if (ready) handler();
    },
    ...(ready ? {} : { 'aria-disabled': true as const }),
  });
}
