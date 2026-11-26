import { formatNumber as f } from '../format';
import { randomInt } from '../random';
import type { Random } from '../random';
import type { Marking, Tier } from '../types';
import { placeParts, toCents, twoFigures, unroundInt } from './arithmetic';
import type { Template } from './template';

const TOLERANCE: Marking = { mode: 'tolerance', percent: 3 };
const ALLOWED_ERROR = TOLERANCE.mode === 'tolerance' ? TOLERANCE.percent / 100 : 0;

/**
 * Tier 1: a two- or three-digit number divided by one digit, with a whole
 * answer. Tier 2: divided by a two-digit number, still whole. Both marked
 * exactly. Tier 3: a five-digit number divided by a two-digit number that does
 * not go evenly, an estimation drill marked within 3%; the stated value is
 * given to the cent.
 */
export const division: Template = {
  skill: 'division',
  tiers: [1, 2, 3],
  build(tier, random) {
    const [dividend, divisor] = operands(tier, random);
    const exact = tier !== 3;
    const value = exact ? dividend / divisor : toCents(dividend / divisor);
    return {
      targetTimeMs: TARGET_MS[tier],
      prompt: `${f(dividend)} ÷ ${f(divisor)}`,
      context: [],
      answer: { kind: 'numeric', value, marking: exact ? { mode: 'exact' } : TOLERANCE, unit: '' },
      solution: chunkSteps(dividend, divisor),
      shortcut: exact ? exactShortcut(dividend, divisor) : estimate(dividend, divisor),
    };
  },
};

const TARGET_MS: Record<Tier, number> = { 1: 10000, 2: 25000, 3: 30000 };

function operands(tier: Tier, random: Random): [number, number] {
  if (tier === 1) {
    const divisor = randomInt(random, 3, 9);
    return [divisor * randomInt(random, 12, 99), divisor];
  }
  if (tier === 2) {
    const divisor = unroundInt(random, 12, 29);
    return [divisor * randomInt(random, 12, 79), divisor];
  }
  // Keep only divisions whose two-figure estimate lands inside the tolerance,
  // so the shortcut always works.
  for (;;) {
    const divisor = unroundInt(random, 13, 98);
    const dividend = randomInt(random, 10_001, 99_999);
    if (dividend % divisor === 0) continue;
    const quotient = dividend / divisor;
    if (Math.abs(twoFigures(quotient) - quotient) <= ALLOWED_ERROR * quotient) return [dividend, divisor];
  }
}

/**
 * Long division in chunks: take off the divisor times each place of the
 * answer, largest first, then divide whatever is left over.
 */
function chunkSteps(dividend: number, divisor: number): string[] {
  const whole = Math.floor(dividend / divisor);
  const steps: string[] = [];
  let left = dividend;
  for (const part of placeParts(whole)) {
    left -= divisor * part;
    steps.push(`${f(divisor)} × ${f(part)} = ${f(divisor * part)}, leaving ${f(left)}`);
  }
  if (left === 0) {
    const parts = placeParts(whole);
    const sum = parts.length > 1 ? `${parts.map(f).join(' + ')} = ` : '';
    steps.push(`So ${f(dividend)} ÷ ${f(divisor)} = ${sum}${f(whole)}`);
    return steps;
  }
  steps.push(`${f(left)} ÷ ${f(divisor)} ≈ ${f(toCents(left / divisor))}`);
  steps.push(`So ${f(dividend)} ÷ ${f(divisor)} ≈ ${f(toCents(dividend / divisor))}`);
  return steps;
}

/**
 * Halve a two-digit divisor and its dividend until the divisor has one digit
 * (one or two halvings), when both stay whole; otherwise find the tens of the
 * answer first. A one-digit divisor is already easy, so it is never halved.
 */
function exactShortcut(dividend: number, divisor: number): string {
  const quotient = dividend / divisor;
  if (dividend % 2 === 0 && divisor % 2 === 0 && divisor >= 10) {
    const chain = [`${f(dividend)} ÷ ${f(divisor)}`];
    let [n, d] = [dividend, divisor];
    while (n % 2 === 0 && d % 2 === 0 && d >= 10) {
      [n, d] = [n / 2, d / 2];
      chain.push(`${f(n)} ÷ ${f(d)}`);
    }
    return `Halve both until the divisor is easy: ${chain.join(' = ')} = ${f(quotient)}`;
  }
  const tens = quotient - (quotient % 10);
  const units = quotient % 10;
  if (units === 0) {
    return `${f(divisor)} × ${f(tens / 10)} = ${f((divisor * tens) / 10)}, add a zero: ${f(dividend)} ÷ ${f(divisor)} = ${f(quotient)}`;
  }
  return (
    `Find the tens first: ${f(divisor)} × ${f(tens)} = ${f(divisor * tens)}; ` +
    `the other ${f(dividend - divisor * tens)} is ${f(divisor)} × ${units}, so ${f(tens)} + ${units} = ${f(quotient)}`
  );
}

/** Find a round multiple of the divisor near the dividend. */
function estimate(dividend: number, divisor: number): string {
  const guess = twoFigures(dividend / divisor);
  return `Find a round multiple of ${f(divisor)} near ${f(dividend)}: ${f(divisor)} × ${f(guess)} = ${f(divisor * guess)}, so ${f(dividend)} ÷ ${f(divisor)} ≈ ${f(guess)}`;
}
