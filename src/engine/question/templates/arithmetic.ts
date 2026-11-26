import { randomInt } from '../random';
import type { Random } from '../random';

/** The minus sign used in prompts and working (typographic, not a hyphen). */
export const MINUS = '−';

/** The non-zero place-value parts of a whole number, largest first: 7,305 -> [7,000, 300, 5]. */
export function placeParts(n: number): number[] {
  const parts: number[] = [];
  let place = 1;
  for (let rest = Math.abs(n); rest > 0; rest = Math.floor(rest / 10), place *= 10) {
    const digit = rest % 10;
    if (digit) parts.unshift(digit * place);
  }
  return parts;
}

/** Round to the nearest multiple of `unit`. */
export function roundTo(n: number, unit: number): number {
  return Math.round(n / unit) * unit;
}

/** The two values either side of `n` that keep only two significant figures. */
export function twoFigureNeighbours(n: number): [number, number] {
  const step = 10 ** Math.max(0, Math.floor(Math.log10(Math.abs(n))) - 1);
  return [Math.floor(n / step) * step, Math.ceil(n / step) * step];
}

/** Round to two significant figures. */
export function twoFigures(n: number): number {
  const step = 10 ** Math.max(0, Math.floor(Math.log10(Math.abs(n))) - 1);
  return Math.round(n / step) * step;
}

/** A whole number in [min, max] that is not a multiple of ten, so it needs real working. */
export function unroundInt(random: Random, min: number, max: number): number {
  for (;;) {
    const n = randomInt(random, min, max);
    if (n % 10 !== 0) return n;
  }
}

/** Round to the cent, for stating approximate answers. */
export function toCents(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Greatest common divisor of two whole numbers. */
export function gcd(a: number, b: number): number {
  let [x, y] = [Math.abs(a), Math.abs(b)];
  while (y) [x, y] = [y, x % y];
  return x;
}

/** Pick one item. */
export function pick<T>(random: Random, items: readonly T[]): T {
  return items[randomInt(random, 0, items.length - 1)]!;
}
