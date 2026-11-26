import { formatNumber as f } from '../format';
import { randomInt } from '../random';
import type { Random } from '../random';
import type { Marking, Tier } from '../types';
import { MINUS, twoFigureNeighbours, unroundInt } from './arithmetic';
import type { Template } from './template';

const TOLERANCE: Marking = { mode: 'tolerance', percent: 3 };

/**
 * Tier 1: one digit times two digits. Tier 2: two digits times two digits.
 * Both are small products, marked exactly. Tier 3: long multiplication of two
 * three-digit numbers, an estimation drill marked within 3%.
 */
export const multiplication: Template = {
  skill: 'multiplication',
  tiers: [1, 2, 3],
  build(tier, random) {
    const [a, b] = operands(tier, random);
    const product = a * b;
    return {
      targetTimeMs: TARGET_MS[tier],
      prompt: `${f(a)} × ${f(b)}`,
      context: [],
      answer: { kind: 'numeric', value: product, marking: tier === 3 ? TOLERANCE : { mode: 'exact' }, unit: '' },
      solution: splitSteps(a, b, tier === 3 ? 100 : 10),
      shortcut: tier === 3 ? estimate(a, b) : nearRoundShortcut(a, b),
    };
  },
};

const TARGET_MS: Record<Tier, number> = { 1: 10000, 2: 25000, 3: 30000 };
const ALLOWED_ERROR = TOLERANCE.mode === 'tolerance' ? TOLERANCE.percent / 100 : 0;

function operands(tier: Tier, random: Random): [number, number] {
  if (tier === 1) return [randomInt(random, 3, 9), unroundInt(random, 12, 99)];
  if (tier === 2) return [unroundInt(random, 12, 99), unroundInt(random, 12, 99)];
  // Keep only pairs whose two-figure estimate lands inside the tolerance,
  // so the shortcut always works (this drops about 1 pair in 100).
  for (;;) {
    const a = unroundInt(random, 101, 999);
    const b = unroundInt(random, 101, 999);
    const [x, y] = bestEstimate(a, b);
    if (Math.abs(x * y - a * b) <= ALLOWED_ERROR * a * b) return [a, b];
  }
}

/** Split the second number at `place` (tens or hundreds), multiply each part, add. */
function splitSteps(a: number, b: number, place: number): string[] {
  const high = b - (b % place);
  const low = b % place;
  return [
    `${f(a)} × ${f(high)} = ${f(a * high)}`,
    `${f(a)} × ${f(low)} = ${f(a * low)}`,
    `${f(a * high)} + ${f(a * low)} = ${f(a * b)}`,
  ];
}

/**
 * Treat whichever two-digit number sits closest to a round ten as that ten,
 * then correct for the difference.
 */
function nearRoundShortcut(a: number, b: number): string {
  const distance = (n: number) => (n < 10 ? Infinity : Math.min(n % 10, 10 - (n % 10)));
  const [near, other] = distance(a) <= distance(b) ? [a, b] : [b, a];
  const round = Math.round(near / 10) * 10;
  const gap = near - round;
  const sign = gap > 0 ? '+' : MINUS;
  const size = Math.abs(gap);
  return (
    `${f(near)} is ${f(round)} ${sign} ${size}: ${f(round)} × ${f(other)} = ${f(round * other)}, ` +
    `${size} × ${f(other)} = ${f(size * other)}, so ${f(round * other)} ${sign} ${f(size * other)} = ${f(a * b)}`
  );
}

/** Round both numbers to two figures, choosing directions so the errors cancel best. */
function bestEstimate(a: number, b: number): [number, number] {
  let best: [number, number] = [a, b];
  let bestError = Infinity;
  for (const x of twoFigureNeighbours(a)) {
    for (const y of twoFigureNeighbours(b)) {
      const error = Math.abs(x * y - a * b);
      if (error < bestError) [best, bestError] = [[x, y], error];
    }
  }
  return best;
}

function estimate(a: number, b: number): string {
  const [x, y] = bestEstimate(a, b);
  const opposite = (x - a) * (y - b) < 0;
  const hundreds = (x / 10) * (y / 10);
  return (
    `Round to two figures${opposite ? ', one up and one down' : ''}: ${f(x)} × ${f(y)} is ` +
    `${f(x / 10)} × ${f(y / 10)} = ${f(hundreds)} hundreds, so ${f(a)} × ${f(b)} ≈ ${f(x * y)}`
  );
}
