import type { Submission } from './types';

/** Magnitude shorthand the keypad accepts, as powers of ten. */
const ZEROS = { k: 3, m: 6, bn: 9 } as const;

/**
 * What may follow the digits of a typed entry, at most one: magnitude shorthand.
 * There is no percent sign: the board shows the answer's unit, so it is never typed.
 */
export type EntrySuffix = keyof typeof ZEROS;

/** The suffix ending an entry, if any: the one grammar the keypad and the marking share. */
export const ENTRY_SUFFIX = /(k|m|bn)$/;

const ENTRY = new RegExp(`^(-?\\d+(?:\\.\\d*)?)${ENTRY_SUFFIX.source.replace('$', '')}?$`);

/**
 * What a typed entry stands for: a number with an optional minus sign and
 * decimal point, then optionally magnitude shorthand (k, m, bn). The unit, such
 * as a percent sign, is never typed. Null while it is not yet a number.
 * Shorthand is read on the digits, so 0.07m is exactly 70,000.
 */
export function readEntry(entry: string): Extract<Submission, { kind: 'numeric' }> | null {
  const match = ENTRY.exec(entry);
  if (!match) return null;
  const [, digits, suffix] = match;
  const zeros = suffix ? ZEROS[suffix as EntrySuffix] : 0;
  const value = Number(`${digits}e${zeros}`);
  return { kind: 'numeric', value: Object.is(value, -0) ? 0 : value };
}
