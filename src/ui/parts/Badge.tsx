import type { ComponentChildren } from 'preact';
import { cx } from './Screen';

/** A grid of badges. */
export function BadgeGrid({ label, children }: { label: string; children: ComponentChildren }) {
  return (
    <ul class="badges" aria-label={label}>
      {children}
    </ul>
  );
}

interface BadgeProps {
  /** The milestone's number, on the seal: "7", "100", "70%". */
  mark: string;
  name: string;
  earned: boolean;
  /** Just unlocked: the seal stamps in. */
  fresh?: boolean;
  /** How it is earned, shown under the name until it is: "Finish a session 7 days running." */
  how?: string;
}

/** A milestone: its number on a tilted lit seal once earned, an outline until then. */
export function Badge({ mark, name, earned, fresh = false, how }: BadgeProps) {
  return (
    <li class={cx('badge', !earned && 'badge-locked', fresh && 'badge-new')}>
      <span class="badge-seal" aria-hidden="true">
        {mark}
      </span>
      <span class="badge-name">
        {name}
        {!earned && <span class="sr-only"> (not yet earned)</span>}
      </span>
      {!earned && how && <span class="badge-how">{how}</span>}
    </li>
  );
}
