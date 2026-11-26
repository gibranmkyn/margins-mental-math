import type { ComponentChildren } from 'preact';
import { cx } from './Screen';

interface PanelProps {
  /** Names the section for screen readers. */
  label: string;
  /** Left of the head line, in display type: a rank, a streak, a skill. */
  title?: ComponentChildren;
  /** Right of the head line, in mono: the number that qualifies the title. */
  meta?: ComponentChildren;
  /** A muted line under the body: what is next, what it takes. */
  foot?: ComponentChildren;
  testId?: string;
  class?: string;
  children?: ComponentChildren;
}

/** A ruled section of a page: hairline on top, head line, body. Never nest panels. */
export function Panel({ label, title, meta, foot, testId, class: extra, children }: PanelProps) {
  return (
    <section class={cx('panel', extra)} aria-label={label} data-testid={testId}>
      {(title !== undefined || meta !== undefined) && (
        <p class="panel-head">
          <span class="panel-title">{title}</span>
          {meta !== undefined && <span class="panel-meta">{meta}</span>}
        </p>
      )}
      {children}
      {foot !== undefined && <p class="panel-foot">{foot}</p>}
    </section>
  );
}
