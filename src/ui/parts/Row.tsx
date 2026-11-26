import type { ComponentChildren } from 'preact';
import { ProgressBar } from './ProgressBar';
import { cx } from './Screen';

/** A ruled list of rows. */
export function RowList({ label, children }: { label: string; children: ComponentChildren }) {
  return (
    <ul class="rows" aria-label={label}>
      {children}
    </ul>
  );
}

interface RowProps {
  title: ComponentChildren;
  /** A muted mono line under the title: "Tier 2 · 41 answered", "Booklet 1 · 12 of 26". */
  meta?: ComponentChildren;
  /** Right side: Stars, a count, a ChipGroup, a ProgressBar. */
  trailing?: ComponentChildren;
  /** A thin white coverage bar under the meta line, 0 to 100: a booklet worked through. */
  coverage?: number;
  /** Names the coverage bar for screen readers. */
  coverageLabel?: string;
  /** Makes the whole row one tap target with a chevron. */
  onClick?: () => void;
  testId?: string;
}

/** One line of a list: a skill, a booklet, a setting. */
export function Row({ title, meta, trailing, coverage, coverageLabel, onClick, testId }: RowProps) {
  const body = (
    <>
      <span class="row-main">
        <span class="row-title">{title}</span>
        {meta !== undefined && <span class="meta">{meta}</span>}
        {coverage !== undefined && <ProgressBar value={coverage} tone="neutral" thin {...(coverageLabel ? { label: coverageLabel } : {})} />}
      </span>
      {(trailing !== undefined || onClick) && (
        <span class="row-trail">
          {trailing}
          {onClick && <Chevron />}
        </span>
      )}
    </>
  );
  return (
    <li data-testid={testId}>
      {onClick ? (
        <button type="button" class={cx('row', 'row-button')} onClick={onClick}>
          {body}
        </button>
      ) : (
        <div class="row">{body}</div>
      )}
    </li>
  );
}

function Chevron() {
  return (
    <svg class="chevron" viewBox="0 0 8 14" width="8" height="14" aria-hidden="true">
      <path d="M1 1L7 7L1 13" fill="none" stroke="currentColor" stroke-width="2" />
    </svg>
  );
}
