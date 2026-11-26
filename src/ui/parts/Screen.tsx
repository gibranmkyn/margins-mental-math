import type { ComponentChildren } from 'preact';
import { useLayoutEffect } from 'preact/hooks';

interface ScreenProps {
  /**
   * `page` (default): a column that scrolls.
   * `task`: fills the viewport exactly (bar, stage, dock) for answering questions; put the controls in a Dock.
   */
  layout?: 'page' | 'task';
  /**
   * Page screens: the primary action and at most one row of alternatives (one button, or two outlined side by side
   * as on Home), pinned at the bottom in the thumb zone, visible without scrolling on every phone while the page scrolls behind it.
   */
  actions?: ComponentChildren;
  class?: string;
  children: ComponentChildren;
}

/** The frame every screen sits in. One per screen, outermost. */
export function Screen({ layout = 'page', actions, class: extra, children }: ScreenProps) {
  // A new screen starts at its top, however far the last one was scrolled (a row low on Home opens Profile at its title).
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, []);
  return (
    <main class={cx('screen', layout === 'task' && 'screen-task', actions !== undefined && 'screen-with-actions', extra)}>
      {children}
      {actions !== undefined && <div class="screen-actions">{actions}</div>}
    </main>
  );
}

interface ScreenBarProps {
  /** Usually a quiet Leave button. */
  leading?: ComponentChildren;
  /** Usually a Tally or a title; takes the remaining width. */
  center?: ComponentChildren;
  /** Usually a count ("2/5") or a Clock. */
  trailing?: ComponentChildren;
}

/** The thin bar across the top of a task screen. */
export function ScreenBar({ leading, center, trailing }: ScreenBarProps) {
  return (
    <header class="screen-bar">
      {leading}
      <div class="screen-bar-center">{center}</div>
      {trailing !== undefined && <span class="screen-bar-trail">{trailing}</span>}
    </header>
  );
}

interface DockProps {
  /** A sheet rises on the panel colour and scrolls its body; `footer` stays pinned. */
  sheet?: boolean;
  footer?: ComponentChildren;
  label?: string;
  class?: string;
  children?: ComponentChildren;
}

/** Full-bleed region at the bottom of a task screen: the keypad, or the feedback sheet. */
export function Dock({ sheet = false, footer, label, class: extra, children }: DockProps) {
  if (!sheet) {
    return (
      <section class={cx('dock', extra)} aria-label={label}>
        {children}
        {footer !== undefined && <div class="dock-foot">{footer}</div>}
      </section>
    );
  }
  return (
    <section class={cx('dock', 'dock-sheet', extra)} aria-label={label}>
      <div class="dock-body">{children}</div>
      {footer !== undefined && <div class="dock-foot">{footer}</div>}
    </section>
  );
}

/** Join class names, skipping empty ones. */
export function cx(...names: Array<string | false | null | undefined>): string {
  return names.filter(Boolean).join(' ');
}
