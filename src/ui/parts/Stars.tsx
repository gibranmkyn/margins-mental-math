import { cx } from './Screen';

interface StarsProps {
  /** Mastery, 0 to 3. */
  value: number;
  large?: boolean;
}

/** Mastery of one skill as zero to three stars. */
export function Stars({ value, large = false }: StarsProps) {
  const filled = Math.max(0, Math.min(3, Math.round(value)));
  return (
    <span class={cx('stars', large && 'stars-lg')} role="img" aria-label={`${filled} of 3 stars`}>
      {[0, 1, 2].map((i) => (
        <svg key={i} class={cx('star', i < filled && 'star-on')} viewBox="0 0 16 16" aria-hidden="true">
          {/* A sharp four-point star: no rounded joins, like everything else. */}
          <path
            d="M8 0.5L10.1 5.9L15.5 8L10.1 10.1L8 15.5L5.9 10.1L0.5 8L5.9 5.9Z"
            fill={i < filled ? 'currentColor' : 'none'}
            stroke="currentColor"
            stroke-width="1.25"
            stroke-linejoin="miter"
          />
        </svg>
      ))}
    </span>
  );
}
