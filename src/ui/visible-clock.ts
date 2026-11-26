/** The part of the page a visible clock needs: whether it is hidden, and word when that changes. */
export type PageVisibility = Pick<Document, 'hidden' | 'addEventListener'>;

export interface VisibleClock {
  /** Milliseconds the page has been visible since the clock was made; stands still while it is hidden. */
  now(): number;
}

/**
 * A monotonic clock that only runs while the page is visible, so the time on a
 * question leaves out a call, another app or a locked phone. Differences between
 * two readings are what count.
 */
export function createVisibleClock(monotonic: () => number = () => performance.now(), page: PageVisibility = document): VisibleClock {
  let banked = 0;
  let since: number | null = page.hidden ? null : monotonic();
  page.addEventListener('visibilitychange', () => {
    if (page.hidden && since !== null) {
      banked += monotonic() - since;
      since = null;
    } else if (!page.hidden && since === null) {
      since = monotonic();
    }
  });
  return { now: () => banked + (since === null ? 0 : monotonic() - since) };
}

let shared: VisibleClock | null = null;

/** The app's one visible clock. */
export function visibleNow(): number {
  shared ??= createVisibleClock();
  return shared.now();
}
