import { useEffect } from 'preact/hooks';
import type { Key } from '../engine/question';

export function keyFromKeyboard(key: string): Key | 'submit' | null {
  if (/^\d$/.test(key)) return key as Key;
  if (key === '.' || key === ',') return '.';
  if (key === '-' || key === '−') return 'negate';
  if (key === 'Backspace') return 'delete';
  if (key === 'Enter') return 'submit';
  if (key === 'k' || key === 'K') return 'k';
  if (key === 'm' || key === 'M') return 'm';
  if (key === 'b' || key === 'B') return 'bn';
  return null;
}

/** Marks a keypad grid key, so Enter on a focused key is left to the key itself. */
export const KEYPAD_KEY = 'data-keypad-key';

/** Enter on a focused keypad key activates that key, as on any button; it is not a submit. */
const onKeypadKey = (target: EventTarget | null) => target instanceof Element && target.closest(`[${KEYPAD_KEY}]`) !== null;

/**
 * A hardware keyboard types into the entry as the on-screen keypad does: digits,
 * point, minus, Backspace, k/m/b, Enter for the bottom button (except on a focused keypad key,
 * which Enter presses instead). A percent key types nothing: the board shows the unit.
 */
export function useTypingKeys(enabled: boolean, type: (key: Key) => void, submit: () => void): void {
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const key = keyFromKeyboard(event.key);
      if (!key) return;
      if (key === 'submit' && onKeypadKey(event.target)) return;
      event.preventDefault();
      if (key === 'submit') submit();
      else type(key);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });
}
