import { cx } from './Screen';

interface ClockProps {
  /** Time left. */
  ms: number;
  /** `bar` sits in a ScreenBar (mock); `hero` carries the screen (sprint). */
  size?: 'bar' | 'hero';
  /** The last stretch: the clock turns the accent. Never red; running low is not a miss. */
  low?: boolean;
  /**
   * Set on a small board tile: white numerals on black, lit amber for the last stretch.
   * For a screen whose live number is the time left (a mock).
   */
  board?: boolean;
  testId?: string;
}

/** Time left, as m:ss. A real deadline only: sprints and mocks. Drills use the PaceBar instead. */
export function Clock({ ms, size = 'bar', low = false, board = false, testId }: ClockProps) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  const text = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  return (
    <span
      class={cx('clock', size === 'hero' && 'clock-hero', board && 'clock-board', low && 'clock-low')}
      role="timer"
      aria-label={`${seconds} seconds left`}
      data-testid={testId}
    >
      {text}
    </span>
  );
}
