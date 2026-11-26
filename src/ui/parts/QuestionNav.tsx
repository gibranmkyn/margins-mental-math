import { useEffect, useRef } from 'preact/hooks';
import { cx } from './Screen';

interface QuestionNavProps {
  /** One entry per question: true once it has an answer. */
  answered: boolean[];
  /** One entry per question: true when the owner flagged it to come back to. */
  flagged?: boolean[];
  current: number;
  /**
   * `grid` (default) wraps every question onto rows: an overview.
   * `strip` keeps one row that scrolls sideways inside itself, the current question kept in view: for a Dock.
   */
  layout?: 'grid' | 'strip';
  onSelect(index: number): void;
}

/**
 * Jump to any question in a mock. Answered questions are filled; the current one is
 * outlined in the accent; a flagged one carries a corner mark in the text colour.
 */
export function QuestionNav({ answered, flagged = [], current, layout = 'grid', onSelect }: QuestionNavProps) {
  const nav = useRef<HTMLElement>(null);

  // Keep the current question in view in a strip, without scrolling anything else.
  useEffect(() => {
    const strip = nav.current;
    if (layout !== 'strip' || !strip) return;
    const cell = strip.children[current] as HTMLElement | undefined;
    if (!cell) return;
    // The strip is positioned, so a cell's offset is measured from the strip's own left edge.
    const left = cell.offsetLeft;
    if (left < strip.scrollLeft) strip.scrollLeft = left;
    else if (left + cell.offsetWidth > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = left + cell.offsetWidth - strip.clientWidth;
  }, [current, layout]);

  return (
    <nav class={cx('qnav', layout === 'strip' && 'qnav-strip')} aria-label="Questions" ref={nav}>
      {answered.map((done, i) => (
        <button
          key={i}
          type="button"
          class={cx('qnav-cell', done && 'qnav-done', flagged[i] && 'qnav-flagged')}
          aria-current={i === current ? 'true' : undefined}
          aria-label={`Question ${i + 1}${done ? ', answered' : ', unanswered'}${flagged[i] ? ', flagged' : ''}`}
          onClick={() => onSelect(i)}
        >
          {i + 1}
        </button>
      ))}
    </nav>
  );
}
