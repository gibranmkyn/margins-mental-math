import type { ButtonHTMLAttributes, ComponentChildren } from 'preact';
import { cx } from './Screen';

type Variant = 'primary' | 'secondary' | 'quiet';

type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'class' | 'className' | 'type'> & {
  /**
   * `primary`: the one thing to do next. Lit, presses down. At most one per screen.
   * `secondary`: a real alternative (Home, Cancel). Outlined.
   * `quiet`: a way out that should not compete (Leave). Text only.
   */
  variant?: Variant;
  /** Adds the forward arrow and pushes the label left: use when the button moves you on. */
  arrow?: boolean;
  /** Marks an action that erases something: a heavy outline and a cross (never red). Use on the confirming press. */
  destructive?: boolean;
  class?: string;
  children: ComponentChildren;
};

export function Button({ variant = 'primary', arrow = false, destructive = false, class: extra, children, ...rest }: ButtonProps) {
  return (
    <button type="button" class={cx('button', `button-${variant}`, arrow && 'button-arrow', destructive && 'button-destructive', extra)} {...rest}>
      {children}
      {arrow && <Arrow />}
    </button>
  );
}

export function Arrow() {
  return (
    <svg class="arrow" viewBox="0 0 24 14" width="24" height="14" aria-hidden="true">
      <path d="M0 7H22M16 1L22 7L16 13" fill="none" stroke="currentColor" stroke-width="2.25" />
    </svg>
  );
}
