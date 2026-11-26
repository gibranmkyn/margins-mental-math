import { useEffect, useState } from 'preact/hooks';
export { localDay } from '../engine/progress';

/**
 * The current time, for a screen that shows "today": refreshed when the app comes
 * back into view (iOS resumes an installed app without reloading it) and at local
 * midnight while it stays open. Only runs while `active`.
 */
export function useNow(active: boolean): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!active) return;
    const refresh = () => {
      if (!document.hidden) setNow(new Date());
    };
    refresh();
    let timer: ReturnType<typeof setTimeout>;
    const atMidnight = () => {
      const at = new Date();
      const midnight = new Date(at.getFullYear(), at.getMonth(), at.getDate() + 1);
      timer = setTimeout(() => {
        refresh();
        atMidnight();
      }, midnight.getTime() - at.getTime() + 1000);
    };
    atMidnight();
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [active]);
  return now;
}
