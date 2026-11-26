import type { ComponentChildren } from 'preact';
import { cx } from './Screen';

/**
 * - `idle`: not chosen.
 * - `selected`: chosen but not yet marked (a mock, where answers can change).
 * - `correct`: the right option, shown after marking.
 * - `wrong`: the owner's wrong choice, shown after marking.
 * - `muted`: any other option after marking.
 */
export type OptionState = 'idle' | 'selected' | 'correct' | 'wrong' | 'muted';

/** Shown on the card after marking, so right and wrong never rest on colour alone. */
const TAGS: Partial<Record<OptionState, string>> = {
  correct: 'Correct answer',
  wrong: 'Your answer',
};

/**
 * The options of one multiple-choice question. `compact` sets short options two to
 * a row where the width allows (one column on the narrowest phones), so a chart
 * and its options fit one screen. Pass `chars` (the longest option's length) so the
 * figures are set as large as the tile allows.
 */
export function OptionList({ label, compact = false, chars, children }: { label: string; compact?: boolean; chars?: number; children: ComponentChildren }) {
  return (
    <div class={cx('options', compact && 'options-compact')} role="group" aria-label={label} style={compact && chars ? { '--chars': chars } : undefined}>
      {children}
    </div>
  );
}

interface OptionCardProps {
  /** "A" to "E". */
  letter: string;
  state?: OptionState;
  /** Omit once the question is marked; the card then cannot be pressed. */
  onSelect?: () => void;
  testId?: string;
  children: ComponentChildren;
}

/** One answer to a scenario, chart or mock question. A whole-row tap target. */
export function OptionCard({ letter, state = 'idle', onSelect, testId, children }: OptionCardProps) {
  const tag = TAGS[state];
  return (
    <button
      type="button"
      class={cx('option', state !== 'idle' && `option-${state}`)}
      aria-pressed={state === 'selected' ? true : onSelect ? false : undefined}
      disabled={!onSelect}
      onClick={onSelect}
      data-testid={testId}
    >
      <span class="option-key" aria-hidden="true">
        {letter}
      </span>
      <span class="option-text">{children}</span>
      {tag && <span class="option-tag">{tag}</span>}
    </button>
  );
}
