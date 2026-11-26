import { cx } from './Screen';

interface TallyProps {
  /** One entry per answered question, in order: true for a hit. */
  results: boolean[];
  /** Questions in the set, answered or not. */
  total: number;
  /** Index of the question on screen (ticks only). */
  current?: number;
  /**
   * `ticks`: thin marks for the screen bar while answering.
   * `blocks`: squares for a result screen; misses are struck through.
   */
  variant?: 'ticks' | 'blocks';
  /** Accessible name of the list, e.g. "Drill 2 of 5" or "Results". */
  label: string;
  /** Accessible name of each mark in a blocks tally, e.g. "Drill". */
  itemName?: string;
}

/** One mark per question: lit for a hit, a short red bar for a miss, an outline for the one on screen. */
export function Tally({ results, total, current, variant = 'ticks', label, itemName = 'Question' }: TallyProps) {
  const count = variant === 'blocks' ? results.length : total;
  return (
    <ol class={cx('tally', `tally-${variant}`)} aria-label={label}>
      {Array.from({ length: count }, (_, i) => {
        const result = results[i];
        const state = result === undefined ? null : result ? 'tally-hit' : 'tally-miss';
        return (
          <li
            key={i}
            class={cx(state, i === current && 'tally-now') || undefined}
            aria-label={variant === 'blocks' ? `${itemName} ${i + 1}: ${result ? 'correct' : 'wrong'}` : undefined}
          />
        );
      })}
    </ol>
  );
}
