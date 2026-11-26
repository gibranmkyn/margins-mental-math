import type { ComponentChildren } from 'preact';
import { cx } from './Screen';

interface StatsProps {
  label?: string;
  /** `columns`: side by side, two to four stats. `list`: one per ruled row, label left, value right. */
  layout?: 'columns' | 'list';
  children: ComponentChildren;
}

/** A group of stats, as a description list. */
export function Stats({ label, layout = 'columns', children }: StatsProps) {
  return (
    <dl class={cx('stats', `stats-${layout}`)} aria-label={label}>
      {children}
    </dl>
  );
}

interface StatProps {
  label: string;
  value: ComponentChildren;
  /** `accent` for a number that is a win (XP earned, a new best); `miss` only for wrong-answer counts. */
  tone?: 'default' | 'accent' | 'miss';
  testId?: string;
}

/** One number and what it counts. Lives inside Stats. */
export function Stat({ label, value, tone = 'default', testId }: StatProps) {
  return (
    <div class={cx('stat', tone !== 'default' && `stat-${tone}`)}>
      <dt class="label">{label}</dt>
      <dd class="stat-value" data-testid={testId}>
        {value}
      </dd>
    </div>
  );
}
