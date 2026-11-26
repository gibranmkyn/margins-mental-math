import { cx } from './Screen';

interface ProgressBarProps {
  /** 0 to 100. */
  value: number;
  /** Read out by screen readers, e.g. "Daily goal". */
  label?: string;
  /** `neutral` (white) for progress that is not a reward, such as booklet coverage. */
  tone?: 'accent' | 'neutral';
  thin?: boolean;
  testId?: string;
}

/** How far through something: a level, a daily goal, a booklet. */
export function ProgressBar({ value, label, tone = 'accent', thin = false, testId }: ProgressBarProps) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      class={cx('progress', thin && 'progress-thin', tone === 'neutral' && 'progress-neutral')}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      data-testid={testId}
    >
      <div class="progress-fill" style={{ transform: `scaleX(${pct / 100})` }} />
    </div>
  );
}

interface PaceBarProps {
  /** How long the bar takes to drain. */
  durationMs: number;
  /** Freeze where it is (the question was answered). */
  stopped: boolean;
  testId?: string;
}

/** Drains toward a target time. No digits; an empty bar changes nothing. Remount it (key) per question. */
export function PaceBar({ durationMs, stopped, testId }: PaceBarProps) {
  return (
    <div class="progress progress-thin" role="presentation" aria-hidden="true" data-testid={testId}>
      <div
        class={cx('progress-fill', 'pace-fill', stopped && 'pace-held')}
        style={{ '--pace-ms': `${durationMs}ms` }}
      />
    </div>
  );
}
