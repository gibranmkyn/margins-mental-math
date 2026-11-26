import type { ComponentChildren } from 'preact';
import { cx } from './Screen';

interface BannerProps {
  /**
   * `note`: neutral, outlined: something worth knowing (tolerance used, streak at risk).
   * `win`: flashed on a board band: a celebration (level-up, badge, personal best).
   */
  tone?: 'note' | 'win';
  /** Small uppercase lead-in on a win: "Promoted", "New best", "Badge". */
  kicker?: string;
  /** Pass "status" when the banner appears in response to something the owner just did. */
  role?: 'status';
  testId?: string;
  children: ComponentChildren;
}

/** One line that matters right now. At most one per screen. */
export function Banner({ tone = 'note', kicker, role, testId, children }: BannerProps) {
  return (
    <p class={cx('banner', `banner-${tone}`)} role={role} data-testid={testId}>
      {kicker !== undefined && <span class="banner-kicker">{kicker}</span>}
      {kicker !== undefined && ' '}
      <span>{children}</span>
    </p>
  );
}

/** A passage set apart on a raised fill: the shortcut after every answer. */
export function Callout({ children }: { children: ComponentChildren }) {
  return <p class="callout">{children}</p>;
}
