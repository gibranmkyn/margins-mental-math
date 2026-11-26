import { describe, expect, it } from 'vitest';
import { createVisibleClock } from './visible-clock';

/** A page whose visibility the test flips, and a monotonic clock the test moves. */
function fakePage() {
  let t = 1000;
  const page = Object.assign(new EventTarget(), { hidden: false });
  return {
    page,
    tick: (ms: number) => void (t += ms),
    now: () => t,
    hide() {
      page.hidden = true;
      page.dispatchEvent(new Event('visibilitychange'));
    },
    show() {
      page.hidden = false;
      page.dispatchEvent(new Event('visibilitychange'));
    },
  };
}

describe('the visible clock: time on a question leaves out time the app was hidden', () => {
  it('runs while the page is visible', () => {
    const f = fakePage();
    const clock = createVisibleClock(f.now, f.page);
    const shown = clock.now();
    f.tick(4000);
    expect(clock.now() - shown).toBe(4000);
  });

  it('does not count a 10-minute call taken in the middle of a question', () => {
    const f = fakePage();
    const clock = createVisibleClock(f.now, f.page);
    const shown = clock.now();
    f.tick(2000);
    f.hide();
    f.tick(600_000);
    f.show();
    f.tick(3000);
    expect(clock.now() - shown).toBe(5000);
  });

  it('stands still while hidden', () => {
    const f = fakePage();
    const clock = createVisibleClock(f.now, f.page);
    f.hide();
    const at = clock.now();
    f.tick(9000);
    expect(clock.now()).toBe(at);
  });

  it('starts still when the page loads hidden', () => {
    const f = fakePage();
    f.page.hidden = true;
    const clock = createVisibleClock(f.now, f.page);
    const at = clock.now();
    f.tick(9000);
    f.show();
    f.tick(1000);
    expect(clock.now() - at).toBe(1000);
  });
});
