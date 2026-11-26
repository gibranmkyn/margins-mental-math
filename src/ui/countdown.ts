import { useEffect, useRef, useState } from 'preact/hooks';

/**
 * Time left to a wall-clock deadline (Date.now()), so it keeps running while the
 * phone sleeps or the app is in the background. Checked every `everyMs`, and again
 * the moment the page is visible again; at zero `onZero` is called, once.
 */
export function useCountdown(deadline: number, onZero: () => void, everyMs = 250): number {
  const [now, setNow] = useState(() => Date.now());
  const zero = useRef(onZero);
  zero.current = onZero;
  useEffect(() => {
    let fired = false;
    const tick = () => {
      const at = Date.now();
      setNow(at);
      if (at >= deadline && !fired) {
        fired = true;
        zero.current();
      }
    };
    const timer = setInterval(tick, everyMs);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [deadline, everyMs]);
  return Math.max(0, deadline - now);
}
