import { formatFixed, formatNumber } from '../../format';
import type { Random } from '../../random';
import { randomInt } from '../../random';

/** $1,250, or $12.50 when there are cents. */
export function money(value: number): string {
  const sign = value < 0 ? '−' : '';
  const abs = Math.abs(value);
  const hasCents = Math.abs(abs - Math.round(abs)) > 1e-9;
  return `${sign}$${hasCents ? formatFixed(abs, 2) : formatNumber(Math.round(abs))}`;
}

/** Always with cents, for unit rates: $1.00, $0.45 */
export function cents(value: number): string {
  return `$${formatFixed(value, 2)}`;
}

/** Formats an option as money with the decimals the option grid asks for (at least cents when not whole). */
export function moneyOption(value: number, decimals: number): string {
  return `$${formatFixed(value, decimals === 0 ? 0 : Math.max(decimals, 2))}`;
}

/** 12.5% */
export function percent(value: number): string {
  return `${formatNumber(value)}%`;
}

/** A plain grouped number with the decimals the option grid asks for. */
export function plainOption(value: number, decimals: number): string {
  return formatFixed(value, decimals);
}

/** A value rounded for display inside a worked solution (three significant figures, never scientific). */
export function approx(value: number): string {
  if (value === 0) return '0';
  const magnitude = Math.floor(Math.log10(Math.abs(value)));
  const decimals = Math.max(0, 2 - magnitude);
  return formatFixed(Number(value.toFixed(Math.min(decimals, 6))), decimals);
}

export function pick<T>(random: Random, items: readonly T[]): T {
  return items[randomInt(random, 0, items.length - 1)]!;
}

/** A random multiple of step in [min, max]. */
export function randomStep(random: Random, min: number, max: number, step: number): number {
  return randomInt(random, Math.ceil(min / step), Math.floor(max / step)) * step;
}

/** Equal up to floating-point dust. */
export function isWhole(value: number): boolean {
  return Math.abs(value - Math.round(value)) < 1e-9;
}

/** A percentage option with the decimals the option grid asks for: 23.4% */
export function percentOption(value: number, decimals: number): string {
  return `${formatFixed(value, decimals)}%`;
}

/** Shuffle a copy of a list. */
export function shuffle<T>(random: Random, items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randomInt(random, 0, i);
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

/** Retry a draw until it is acceptable; the random source keeps it reproducible. */
export function until<T>(draw: () => T, ok: (value: T) => boolean, attempts = 200): T {
  for (let i = 0; i < attempts; i++) {
    const value = draw();
    if (ok(value)) return value;
  }
  throw new Error('No acceptable draw found');
}

/** Rounded to one decimal place, without trailing zeros: 3.6, 4 */
export function oneDecimal(value: number): string {
  return formatNumber(Math.round(value * 10) / 10);
}

/**
 * A whole-number threshold for "more than x" or "less than x" that makes the
 * statement true or false as wanted. It clears the actual value by at least a
 * point and 4%, so rounded working settles it, but sits within about three
 * points or 12%, so no statement can be dismissed without working at all.
 * Null when no sensible positive threshold exists.
 */
export function threshold(random: Random, actual: number, more: boolean, wantTrue: boolean): number | null {
  const gap = Math.max(1 + random.next(), Math.abs(actual) * (0.04 + random.next() * 0.03));
  const below = more === wantTrue;
  const x = below ? Math.floor(actual - gap) : Math.ceil(actual + gap);
  return x >= 1 ? x : null;
}
