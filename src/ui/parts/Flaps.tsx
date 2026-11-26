import { cx } from './Screen';

interface Props {
  /** The figure to show, already formatted: "12", "4", "1,240". One tile per digit; separators sit between tiles. */
  value: string;
  /** `hero` for the one number that carries a screen (the session score); `title` beside a panel title (the streak). */
  size?: 'title' | 'hero';
  class?: string;
}

/**
 * A number on flap tiles, as on a departure board: black tiles, lit digits, in both themes.
 * The seam is the tile's two tones meeting behind the digit; nothing is drawn across the glyph.
 * For the streak and the score only: never for a number that must be read at speed (a prompt, an answer).
 */
export function Flaps({ value, size = 'title', class: className }: Props) {
  return (
    <span class={cx('flaps', `flaps-${size}`, className)}>
      {[...value].map((char, i) =>
        /\d/.test(char) ? (
          <span class="flap" key={i}>
            {char}
          </span>
        ) : (
          <span class="flap-sep" key={i}>
            {char}
          </span>
        ),
      )}
    </span>
  );
}
